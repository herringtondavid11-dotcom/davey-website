// Plaid Liabilities: cards (statement balance, due date, APR), mortgages (rate, payment, escrow, YTD interest and
// principal, origination, maturity, property city/state) and student loans. ON by default (PLAID_LIABILITIES=false
// turns it off); if Plaid answers PRODUCT_NOT_ENABLED it turns itself off (server_flags) until someone clears the flag.
// Data is stored encrypted per Item (plaid_liabilities / plaid_liabilities_sandbox; service key only) and refreshed on
// link, on Plaid's LIABILITIES DEFAULT_UPDATE webhook, and at most daily on sync. The street address is never kept.
import { decrypt, encrypt } from "./crypto.ts";
import { mode } from "./mode.ts";
import { plaid, PlaidError, toCents } from "./plaid.ts";
import { rest } from "./supabase.ts";

/** One account's liability details, in the app's shape (cents, basis points, ISO dates). */
export interface LiabilityDetails {
  liability_kind: "credit" | "mortgage" | "student";
  apr_basis_points: number | null;
  interest_rate_type: string | null;
  last_statement_balance_cents: number | null;
  next_payment_due_date: string | null;
  next_payment_amount_cents: number | null;
  last_payment_amount_cents: number | null;
  last_payment_date: string | null;
  origination_date: string | null;
  origination_principal_cents: number | null;
  maturity_date: string | null;
  loan_term_months: number | null;
  escrow_balance_cents: number | null;
  ytd_interest_paid_cents: number | null;
  ytd_principal_paid_cents: number | null;
  property_city: string | null;
  property_state: string | null;
}

type Json = Record<string, any>;
const FLAG_KEY = "liabilities_disabled";
const STALE_MS = 24 * 3600 * 1000;
let disabledCache: { value: boolean; at: number } | null = null;

function table(): string {
  return mode.sandbox ? "plaid_liabilities_sandbox" : "plaid_liabilities";
}

/** On unless PLAID_LIABILITIES=false or Plaid said the product isn't enabled for this client. */
export async function liabilitiesEnabled(): Promise<boolean> {
  if (Deno.env.get("PLAID_LIABILITIES") === "false") return false;
  if (disabledCache && Date.now() - disabledCache.at < 600_000) return !disabledCache.value;
  try {
    const rows = await (await rest(`server_flags?select=value&key=eq.${FLAG_KEY}${mode.sandbox ? "_sandbox" : ""}`)).json() as { value: Json }[];
    disabledCache = { value: rows[0]?.value?.disabled === true, at: Date.now() };
  } catch {
    disabledCache = { value: false, at: Date.now() };
  }
  return !disabledCache.value;
}

/** PRODUCT_NOT_ENABLED (or INVALID_PRODUCT): stop asking for Liabilities and leave a note for the owner. */
export async function disableLiabilities(reason: string): Promise<void> {
  disabledCache = { value: true, at: Date.now() };
  console.error(`ALERT: Plaid Liabilities disabled automatically (${reason}). Enable it in the Plaid Dashboard, then delete server_flags row ${FLAG_KEY}.`);
  try {
    await rest("server_flags?on_conflict=key", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ key: `${FLAG_KEY}${mode.sandbox ? "_sandbox" : ""}`, value: { disabled: true, reason, at: new Date().toISOString() } }),
    });
  } catch {
    // The in-memory flag still holds for this instance.
  }
}

export function isProductNotEnabled(error: unknown): boolean {
  return error instanceof PlaidError && ["PRODUCT_NOT_ENABLED", "INVALID_PRODUCT", "PRODUCTS_NOT_ENABLED"].includes(error.code);
}

function months(term: string | null | undefined): number | null {
  if (!term) return null;
  const match = /(\d+)\s*(year|yr|month|mo)/i.exec(term);
  if (!match) return null;
  const n = Number(match[1]);
  return /^y/i.test(match[2]) ? n * 12 : n;
}

function empty(kind: LiabilityDetails["liability_kind"]): LiabilityDetails {
  return {
    liability_kind: kind, apr_basis_points: null, interest_rate_type: null, last_statement_balance_cents: null,
    next_payment_due_date: null, next_payment_amount_cents: null, last_payment_amount_cents: null, last_payment_date: null,
    origination_date: null, origination_principal_cents: null, maturity_date: null, loan_term_months: null,
    escrow_balance_cents: null, ytd_interest_paid_cents: null, ytd_principal_paid_cents: null, property_city: null,
    property_state: null,
  };
}

const bps = (percent: number | null | undefined) => typeof percent === "number" ? Math.round(percent * 100) : null;

/** /liabilities/get → details per account. Pure (unit-tested). The street address and postal code are dropped. */
export function mapLiabilities(liabilities: Json): Map<string, LiabilityDetails> {
  const result = new Map<string, LiabilityDetails>();
  for (const card of liabilities.credit ?? []) {
    const aprs: Json[] = card.aprs ?? [];
    const purchase = aprs.find((apr) => apr.apr_type === "purchase_apr") ?? aprs[0];
    result.set(card.account_id, {
      ...empty("credit"),
      apr_basis_points: bps(purchase?.apr_percentage),
      last_statement_balance_cents: toCents(card.last_statement_balance ?? null),
      next_payment_due_date: card.next_payment_due_date ?? null,
      next_payment_amount_cents: toCents(card.minimum_payment_amount ?? null),
      last_payment_amount_cents: toCents(card.last_payment_amount ?? null),
      last_payment_date: card.last_payment_date ?? null,
    });
  }
  for (const loan of liabilities.mortgage ?? []) {
    result.set(loan.account_id, {
      ...empty("mortgage"),
      apr_basis_points: bps(loan.interest_rate?.percentage),
      interest_rate_type: loan.interest_rate?.type ?? null,
      next_payment_due_date: loan.next_payment_due_date ?? null,
      next_payment_amount_cents: toCents(loan.next_monthly_payment ?? null),
      last_payment_amount_cents: toCents(loan.last_payment_amount ?? null),
      last_payment_date: loan.last_payment_date ?? null,
      origination_date: loan.origination_date ?? null,
      origination_principal_cents: toCents(loan.origination_principal_amount ?? null),
      maturity_date: loan.maturity_date ?? null,
      loan_term_months: months(loan.loan_term),
      escrow_balance_cents: toCents(loan.escrow_balance ?? null),
      ytd_interest_paid_cents: toCents(loan.ytd_interest_paid ?? null),
      ytd_principal_paid_cents: toCents(loan.ytd_principal_paid ?? null),
      property_city: loan.property_address?.city ?? null,
      property_state: loan.property_address?.region ?? null,
    });
  }
  for (const loan of liabilities.student ?? []) {
    result.set(loan.account_id, {
      ...empty("student"),
      apr_basis_points: bps(loan.interest_rate_percentage),
      next_payment_due_date: loan.next_payment_due_date ?? null,
      next_payment_amount_cents: toCents(loan.minimum_payment_amount ?? null),
      last_payment_amount_cents: toCents(loan.last_payment_amount ?? null),
      last_payment_date: loan.last_payment_date ?? null,
      origination_date: loan.origination_date ?? null,
      origination_principal_cents: toCents(loan.origination_principal_amount ?? null),
      maturity_date: loan.expected_payoff_date ?? null,
      ytd_interest_paid_cents: toCents(loan.ytd_interest_paid ?? null),
      ytd_principal_paid_cents: toCents(loan.ytd_principal_paid ?? null),
    });
  }
  return result;
}

export type LiabilitiesStatus = "ok" | "unsupported" | "not_enabled" | "not_consented" | "off";

/** Asks Plaid. PRODUCTS_NOT_SUPPORTED (the bank has no Liabilities) is normal: balances still sync. */
export async function fetchLiabilities(accessToken: string): Promise<{ details: Map<string, LiabilityDetails>; status: LiabilitiesStatus }> {
  if (!(await liabilitiesEnabled())) return { details: new Map(), status: "off" };
  try {
    const response = await plaid<{ liabilities: Json }>("/liabilities/get", { access_token: accessToken });
    return { details: mapLiabilities(response.liabilities ?? {}), status: "ok" };
  } catch (error) {
    if (!(error instanceof PlaidError)) throw error;
    if (isProductNotEnabled(error)) {
      await disableLiabilities(error.code);
      return { details: new Map(), status: "not_enabled" };
    }
    if (error.code === "PRODUCTS_NOT_SUPPORTED" || error.code === "NO_LIABILITY_ACCOUNTS") return { details: new Map(), status: "unsupported" };
    // Not consented for this Item (linked before Liabilities was requested), or another Item error: balances still sync.
    return { details: new Map(), status: "not_consented" };
  }
}

/** Encrypted at rest, like access tokens. */
export async function storeLiabilities(userId: string, itemId: string, details: Map<string, LiabilityDetails>, status: LiabilitiesStatus) {
  const ciphertext = await encrypt(JSON.stringify(Object.fromEntries(details)));
  await rest(`${table()}?on_conflict=item_id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ item_id: itemId, user_id: userId, ciphertext, status, refreshed_at: new Date().toISOString(), stale: false }),
  });
}

export async function loadLiabilities(itemId: string): Promise<{ details: Map<string, LiabilityDetails>; status: LiabilitiesStatus; fresh: boolean } | null> {
  const rows = await (await rest(`${table()}?select=ciphertext,status,refreshed_at,stale&item_id=eq.${encodeURIComponent(itemId)}`)).json() as
    { ciphertext: string; status: LiabilitiesStatus; refreshed_at: string; stale: boolean }[];
  const row = rows[0];
  if (!row) return null;
  const details = new Map(Object.entries(JSON.parse(await decrypt(row.ciphertext)) as Record<string, LiabilityDetails>));
  const fresh = !row.stale && Date.now() - Date.parse(row.refreshed_at) < STALE_MS;
  return { details, status: row.status, fresh };
}

/** For a sync: the stored copy while it's fresh (under a day, no webhook since), else Plaid again. */
export async function liabilitiesForItem(userId: string, itemId: string, accessToken: string, force = false) {
  if (!force) {
    try {
      const stored = await loadLiabilities(itemId);
      if (stored?.fresh) return stored;
    } catch {
      // Unreadable or missing: fetch again.
    }
  }
  const fetched = await fetchLiabilities(accessToken);
  if (fetched.status !== "off") {
    try {
      await storeLiabilities(userId, itemId, fetched.details, fetched.status);
    } catch {
      console.error("Liabilities not stored (table missing?)");
    }
  }
  return { ...fetched, fresh: true };
}

/** Plaid's LIABILITIES DEFAULT_UPDATE webhook: the next sync fetches again. */
export async function markLiabilitiesStale(itemId: string): Promise<void> {
  await rest(`${table()}?item_id=eq.${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ stale: true }),
  });
}


