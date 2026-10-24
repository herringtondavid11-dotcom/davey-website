// Plaid Investments for Davey: holdings, securities, 24 months of investment transactions, and the portfolio value
// history per account. Stored server-side (investment_* tables, household-readable) so iPhone, Mac and the web show the
// same numbers. History before the first real daily snapshot is reconstructed (`estimated`) from today's holdings,
// rolled back through the investment transactions.
import { plaid, PlaidError } from "./plaid.ts";
import { rest } from "./supabase.ts";

export interface PlaidSecurity {
  security_id: string;
  name?: string | null;
  ticker_symbol?: string | null;
  type?: string | null;
  close_price?: number | null;
  close_price_as_of?: string | null;
  is_cash_equivalent?: boolean | null;
  iso_currency_code?: string | null;
}

export interface PlaidHolding {
  account_id: string;
  security_id: string;
  quantity: number;
  institution_price?: number | null;
  institution_value?: number | null;
  cost_basis?: number | null;
  iso_currency_code?: string | null;
}

export interface PlaidInvestmentTransaction {
  investment_transaction_id: string;
  account_id: string;
  security_id?: string | null;
  date: string;
  name?: string | null;
  type: string;
  subtype?: string | null;
  quantity?: number | null;
  price?: number | null;
  amount: number;
  fees?: number | null;
  iso_currency_code?: string | null;
}

export interface DayValue {
  date: string;
  value: number;
  net_flow: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** yyyy-mm-dd of a date in UTC. */
export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDay(d);
}

/**
 * Plaid's `/investments/transactions/get` returns at most about 24 months. 730 days is that window
 * (2026-10-22 → 2024-10-22) and is what a full history pull asks for.
 */
export const INVESTMENT_HISTORY_DAYS = 730;

export function investmentHistoryStart(today: string): string {
  return addDays(today, -INVESTMENT_HISTORY_DAYS);
}

/**
 * Money moved into (+) or out of (−) the account by a transaction, as opposed to market growth: contributions,
 * deposits, withdrawals and transfers. Plaid's amount is positive when cash leaves the account.
 */
export function externalFlow(t: Pick<PlaidInvestmentTransaction, "type" | "subtype" | "amount">): number {
  const sub = (t.subtype ?? "").toLowerCase();
  const flowSubtypes = ["contribution", "deposit", "withdrawal", "transfer", "rollover", "distribution", "request"];
  if (t.type === "transfer" || (t.type === "cash" && flowSubtypes.some((s) => sub.includes(s)))) return -t.amount;
  return 0;
}

/**
 * The account's value at the end of each day from `start` to `today`, reconstructed backwards from today's holdings:
 * before a transaction, a security position had `quantity` less (Plaid: positive = bought) and cash had `amount` more
 * (Plaid: positive = cash spent). Positions are priced at the security's last transaction price on or before that day,
 * else today's price. Transactions in cash-equivalent securities (money market sweeps) are internal and skipped.
 */
export function reconstructHistory(input: {
  holdings: PlaidHolding[];
  securities: PlaidSecurity[];
  transactions: PlaidInvestmentTransaction[];
  today: string;
  start: string;
}): DayValue[] {
  const securities = new Map(input.securities.map((s) => [s.security_id, s]));
  const isCash = (id: string | null | undefined) => {
    if (!id) return true;
    const s = securities.get(id);
    return Boolean(s?.is_cash_equivalent) || s?.type === "cash";
  };
  const qty = new Map<string, number>();
  const todayPrice = new Map<string, number>();
  let cash = 0;
  for (const h of input.holdings) {
    const price = h.institution_price ?? securities.get(h.security_id)?.close_price ?? 0;
    if (isCash(h.security_id)) {
      cash += h.institution_value ?? h.quantity * (price || 1);
    } else {
      qty.set(h.security_id, (qty.get(h.security_id) ?? 0) + h.quantity);
      todayPrice.set(h.security_id, price);
    }
  }
  // Price history per security from the transactions (ascending), for "last price on or before".
  const prices = new Map<string, { date: string; price: number }[]>();
  for (const t of input.transactions) {
    if (!t.security_id || !t.price || t.price <= 0 || isCash(t.security_id)) continue;
    const list = prices.get(t.security_id) ?? [];
    list.push({ date: t.date, price: t.price });
    prices.set(t.security_id, list);
  }
  // Today's price is the last point; between known points the price is interpolated by day.
  for (const [id, price] of todayPrice) {
    if (!price) continue;
    const list = prices.get(id) ?? [];
    list.push({ date: input.today, price });
    prices.set(id, list);
  }
  for (const list of prices.values()) list.sort((a, b) => a.date.localeCompare(b.date));
  const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / 86_400_000;
  const priceOn = (id: string, day: string) => {
    const list = prices.get(id);
    if (!list?.length) return todayPrice.get(id) ?? 0;
    if (day <= list[0].date) return list[0].price;
    for (let i = 1; i < list.length; i++) {
      if (day <= list[i].date) {
        const a = list[i - 1], b = list[i];
        const span = dayNumber(b.date) - dayNumber(a.date);
        return span > 0 ? a.price + (b.price - a.price) * (dayNumber(day) - dayNumber(a.date)) / span : b.price;
      }
    }
    return list[list.length - 1].price;
  };

  const byDay = new Map<string, PlaidInvestmentTransaction[]>();
  for (const t of input.transactions) {
    if (t.date > input.today || t.date < input.start) continue;
    const list = byDay.get(t.date) ?? [];
    list.push(t);
    byDay.set(t.date, list);
  }

  const out: DayValue[] = [];
  for (let day = input.today; day >= input.start; day = addDays(day, -1)) {
    let value = cash;
    for (const [id, q] of qty) value += Math.max(0, q) * priceOn(id, day);
    const todays = byDay.get(day) ?? [];
    const flow = todays.reduce((sum, t) => sum + externalFlow(t), 0);
    out.push({ date: day, value: round2(Math.max(0, value)), net_flow: round2(flow) });
    // Undo this day's transactions to get the state at the end of the previous day.
    for (const t of todays) {
      if (t.security_id && !isCash(t.security_id) && t.quantity) {
        qty.set(t.security_id, (qty.get(t.security_id) ?? 0) - t.quantity);
      }
      if (!(t.security_id && isCash(t.security_id) && t.type !== "cash" && t.type !== "fee" && t.type !== "transfer")) {
        cash += t.amount;
      }
    }
  }
  out.reverse();
  // Where the transactions don't add up (cash would go below zero), history before that point isn't meaningful:
  // start after the last day the rollback reached zero.
  const lastEmpty = out.findLastIndex((d, i) => d.value <= 0 && i < out.length - 1);
  return lastEmpty >= 0 ? out.slice(lastEmpty + 1) : out;
}

// ---------- Plaid + storage ----------

export type InvestmentsStatus = "ok" | "needs_consent" | "not_supported";

export interface ItemRow {
  user_id: string;
  item_id: string;
}

/** Product lists from Plaid `/item/get`. `available_products` is intentionally not a signal: the Item doesn't have it yet. */
export interface PlaidItemProducts {
  products?: readonly string[] | null;
  billed_products?: readonly string[] | null;
  consented_products?: readonly string[] | null;
}

export function hasInvestmentsProduct(item: PlaidItemProducts): boolean {
  for (const list of [item.products, item.billed_products, item.consented_products]) {
    if (list?.includes("investments")) return true;
  }
  return false;
}

/**
 * Whether the daily job should pull this Item.
 * Ready (`ok`) and consent-needed items are always in. So is any Item whose Plaid product list
 * includes investments, even when `investments_status` was never set — that status used to be
 * required, which dropped every connection that hadn't already succeeded. `not_supported` does
 * not exclude an Item that still has the product (an investment account can appear later).
 * Items already `ok` stay in even if this run's product list omits investments.
 * Items that only *offer* investments (`available_products`) are not pulled.
 */
export function shouldSnapshotItem(input: {
  investmentsStatus: string | null | undefined;
  products: PlaidItemProducts | null;
}): boolean {
  if (input.investmentsStatus === "ok" || input.investmentsStatus === "needs_consent") return true;
  return Boolean(input.products && hasInvestmentsProduct(input.products));
}

/** Map a Plaid failure onto the Item status we store. Anything else is a recorded failure and is retried. */
export function classifyInvestmentsError(error: unknown): {
  status: "needs_consent" | "not_supported" | "failed";
  code: string;
} {
  const code = error instanceof PlaidError ? error.code : "unknown";
  if (code === "ADDITIONAL_CONSENT_REQUIRED") return { status: "needs_consent", code };
  if (code === "PRODUCTS_NOT_SUPPORTED" || code === "NO_INVESTMENT_ACCOUNTS") {
    return { status: "not_supported", code };
  }
  return { status: "failed", code };
}

export interface ItemSyncReport {
  item_id: string;
  institution_name: string | null;
  outcome: "ok" | "needs_consent" | "not_supported" | "skipped" | "failed";
  code: string | null;
}

/** Counts plus every consent or hard failure, with the Plaid error code, so a run doesn't swallow them. */
export function summarizeInvestmentSync(reports: ItemSyncReport[]) {
  const count = (outcome: ItemSyncReport["outcome"]) => reports.filter((report) => report.outcome === outcome).length;
  return {
    items: reports.length,
    ok: count("ok"),
    needs_consent: count("needs_consent"),
    not_supported: count("not_supported"),
    skipped: count("skipped"),
    failed: count("failed"),
    failures: reports
      .filter((report) => report.outcome === "failed" || report.outcome === "needs_consent")
      .map((report) => ({
        item_id: report.item_id,
        institution_name: report.institution_name,
        outcome: report.outcome,
        code: report.code,
      })),
    // Every Item the job actually tried, with the Plaid code when there is one.
    results: reports.filter((report) => report.outcome !== "skipped"),
  };
}

/** Item ids that still have investment rows after the Item itself is gone (a removed or replaced connection). */
export function orphanedItemIds(referenced: Iterable<string>, liveItemIds: Iterable<string>): string[] {
  const live = new Set(liveItemIds);
  return [...new Set(referenced)].filter((id) => id.length > 0 && !live.has(id)).sort();
}

async function upsert(table: string, conflict: string, rows: Record<string, unknown>[]): Promise<void> {
  for (let i = 0; i < rows.length; i += 500) {
    const response = await rest(`${table}?on_conflict=${conflict}`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows.slice(i, i + 500)),
    });
    if (!response.ok) throw new Error(`${table} upsert failed: ${response.status}`);
  }
}

async function setItemStatus(itemsTable: string, itemId: string, status: InvestmentsStatus, errorCode: string | null) {
  const now = new Date().toISOString();
  await rest(`${itemsTable}?item_id=eq.${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      investments_status: status,
      investments_error_code: errorCode,
      investments_error_at: errorCode ? now : null,
      ...(status === "ok" ? { investments_synced_at: now } : {}),
    }),
  });
}

/** Latest Plaid error for an Item, without changing `investments_status` (a login error isn't "not supported"). */
export async function recordInvestmentsFailure(itemsTable: string, itemId: string, code: string): Promise<void> {
  await rest(`${itemsTable}?item_id=eq.${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ investments_error_code: code, investments_error_at: new Date().toISOString() }),
  });
}

const INVESTMENT_ROW_TABLES = ["investment_holdings", "investment_transactions", "investment_snapshots"] as const;

/** Holdings, transactions and snapshots for one Item. Called when the Item is removed or replaced. */
export async function deleteInvestmentsForItem(itemId: string): Promise<void> {
  const id = encodeURIComponent(itemId);
  for (const table of INVESTMENT_ROW_TABLES) {
    await rest(`${table}?item_id=eq.${id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  }
}

/**
 * Deletes investment rows whose Item is in neither `plaid_items` nor `plaid_items_sandbox`
 * (a reconnect that removed the old Item and left its history behind). Returns how many snapshot rows went.
 */
export async function deleteOrphanedInvestments(liveItemIds: Iterable<string>): Promise<{ items: string[]; snapshots: number }> {
  const referenced: string[] = [];
  const snapshotItemIds: string[] = [];
  for (const table of INVESTMENT_ROW_TABLES) {
    const rows = await pagedRows(`${table}?select=item_id`);
    for (const row of rows) {
      const itemId = typeof row.item_id === "string" ? row.item_id : "";
      referenced.push(itemId);
      if (table === "investment_snapshots") snapshotItemIds.push(itemId);
    }
  }
  const orphans = orphanedItemIds(referenced, liveItemIds);
  const orphanSet = new Set(orphans);
  const snapshots = snapshotItemIds.filter((id) => orphanSet.has(id)).length;
  for (const itemId of orphans) await deleteInvestmentsForItem(itemId);
  return { items: orphans, snapshots };
}

/**
 * Pulls holdings, securities and 24 months of investment transactions for an Item, stores them, and writes the value
 * history: a real snapshot for today, and estimated days before the first real snapshot (never over a real one).
 * `refresh` asks Plaid to fetch fresh data from the institution first (results arrive by webhook as well).
 * Consent and "no investments here" are stored on the Item. Every other Plaid error is stored (its code) and rethrown.
 */
export async function syncInvestments(item: ItemRow, accessToken: string, itemsTable: string,
                                      opts: { refresh?: boolean; transactions?: boolean } = {}): Promise<{ status: InvestmentsStatus; accounts: number; code: string | null }> {
  try {
    return await pullInvestments(item, accessToken, itemsTable, opts);
  } catch (error) {
    const classified = classifyInvestmentsError(error);
    if (classified.status === "failed") {
      await recordInvestmentsFailure(itemsTable, item.item_id, classified.code);
      throw error;
    }
    await setItemStatus(itemsTable, item.item_id, classified.status, classified.code);
    return { status: classified.status, accounts: 0, code: classified.code };
  }
}

async function pullInvestments(item: ItemRow, accessToken: string, itemsTable: string,
                               opts: { refresh?: boolean; transactions?: boolean }): Promise<{ status: InvestmentsStatus; accounts: number; code: string | null }> {
  if (opts.refresh) {
    try { await plaid("/investments/refresh", { access_token: accessToken }); } catch { /* best effort */ }
  }
  const holdingsResult = await plaid<{ holdings: PlaidHolding[]; securities: PlaidSecurity[]; accounts: { account_id: string; type: string }[] }>(
    "/investments/holdings/get",
    { access_token: accessToken },
  );
  const { holdings, securities } = holdingsResult;
  const investmentAccountIds = (holdingsResult.accounts ?? []).filter((account) => account.type === "investment").map((account) => account.account_id);
  const accountIds = [...new Set([...holdings.map((holding) => holding.account_id), ...investmentAccountIds])];
  // A checking-only Item that consented to Investments has nothing to reconstruct. Skip the 24-month pull.
  if (accountIds.length === 0) {
    await setItemStatus(itemsTable, item.item_id, "not_supported", "NO_INVESTMENT_ACCOUNTS");
    return { status: "not_supported", accounts: 0, code: "NO_INVESTMENT_ACCOUNTS" };
  }
  const today = isoDay(new Date());
  const start = investmentHistoryStart(today);

  let transactions: PlaidInvestmentTransaction[] = [];
  if (opts.transactions !== false) {
    for (let offset = 0; offset < 20_000;) {
      const page = await plaid<{ investment_transactions: PlaidInvestmentTransaction[]; securities: PlaidSecurity[]; total_investment_transactions: number }>(
        "/investments/transactions/get",
        { access_token: accessToken, start_date: start, end_date: today, options: { count: 500, offset } },
      );
      transactions.push(...page.investment_transactions);
      for (const s of page.securities) if (!securities.some((x) => x.security_id === s.security_id)) securities.push(s);
      offset += page.investment_transactions.length;
      if (!page.investment_transactions.length || offset >= page.total_investment_transactions) break;
    }
  }

  await upsert("investment_securities", "security_id", securities.map((s) => ({
    security_id: s.security_id, name: s.name ?? null, ticker: s.ticker_symbol ?? null, type: s.type ?? null,
    close_price: s.close_price ?? null, close_price_as_of: s.close_price_as_of ?? null,
    iso_currency_code: s.iso_currency_code ?? null, updated_at: new Date().toISOString(),
  })));
  // Today's positions replace the previous ones for this Item (sold positions disappear).
  await rest(`investment_holdings?item_id=eq.${encodeURIComponent(item.item_id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  await upsert("investment_holdings", "item_id,account_id,security_id", holdings.map((h) => ({
    user_id: item.user_id, item_id: item.item_id, account_id: h.account_id, security_id: h.security_id,
    quantity: h.quantity, institution_price: h.institution_price ?? null, institution_value: h.institution_value ?? null,
    cost_basis: h.cost_basis ?? null, iso_currency_code: h.iso_currency_code ?? null, updated_at: new Date().toISOString(),
  })));
  if (transactions.length) {
    await upsert("investment_transactions", "investment_transaction_id", transactions.map((t) => ({
      investment_transaction_id: t.investment_transaction_id, user_id: item.user_id, item_id: item.item_id,
      account_id: t.account_id, security_id: t.security_id ?? null, date: t.date, name: t.name ?? null, type: t.type,
      subtype: t.subtype ?? null, quantity: t.quantity ?? null, price: t.price ?? null, amount: t.amount, fees: t.fees ?? null,
      iso_currency_code: t.iso_currency_code ?? null,
    })));
  }

  // Days that already have a real snapshot keep it.
  const real = new Set<string>();
  if (accountIds.length) {
    const rows = await (await rest(
      `investment_snapshots?select=account_id,date&estimated=eq.false&account_id=in.(${accountIds.map(encodeURIComponent).join(",")})`,
    )).json() as { account_id: string; date: string }[];
    for (const r of rows) real.add(`${r.account_id}|${r.date}`);
  }
  const snapshots: Record<string, unknown>[] = [];
  for (const accountId of accountIds) {
    const history = reconstructHistory({
      holdings: holdings.filter((h) => h.account_id === accountId), securities,
      transactions: transactions.filter((t) => t.account_id === accountId), today, start,
    });
    for (const day of history) {
      const isToday = day.date === today;
      if (!isToday && real.has(`${accountId}|${day.date}`)) continue;
      snapshots.push({ user_id: item.user_id, item_id: item.item_id, account_id: accountId, date: day.date,
                       value: day.value, net_flow: day.net_flow, estimated: !isToday });
    }
  }
  // The estimate is rebuilt from scratch each time (never touching real snapshots).
  if (accountIds.length && opts.transactions !== false) {
    await rest(`investment_snapshots?estimated=eq.true&account_id=in.(${accountIds.map(encodeURIComponent).join(",")})`,
               { method: "DELETE", headers: { Prefer: "return=minimal" } });
  }
  await upsert("investment_snapshots", "account_id,date", opts.transactions === false
    ? snapshots.filter((row) => row.estimated === false) : snapshots);
  await setItemStatus(itemsTable, item.item_id, "ok", null);
  return { status: "ok", accounts: accountIds.length, code: null };
}

/** All rows of a query, 1,000 at a time (the API returns at most 1,000 per request). */
async function pagedRows(query: string): Promise<Record<string, any>[]> {
  const rows: Record<string, any>[] = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await (await rest(`${query}&limit=1000&offset=${offset}`)).json() as Record<string, any>[];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

/** Everything the apps show for an Item: per account, holdings (with security details) and the value history. */
export async function readInvestments(itemId: string) {
  const id = encodeURIComponent(itemId);
  const [holdings, snapshots] = await Promise.all([
    rest(`investment_holdings?select=account_id,security_id,quantity,institution_price,institution_value,cost_basis&item_id=eq.${id}`).then((r) => r.json()),
    pagedRows(`investment_snapshots?select=account_id,date,value,net_flow,estimated&item_id=eq.${id}&order=account_id.asc,date.asc`),
  ]) as [Record<string, any>[], Record<string, any>[]];
  const securityIds = [...new Set(holdings.map((h) => h.security_id))];
  const securities = securityIds.length
    ? await (await rest(`investment_securities?select=security_id,name,ticker,type,close_price&security_id=in.(${securityIds.map((s) => `"${s}"`).join(",")})`)).json() as Record<string, any>[]
    : [];
  const bySecurity = new Map(securities.map((s) => [s.security_id, s]));
  const accounts = new Map<string, { account_id: string; holdings: unknown[]; snapshots: unknown[] }>();
  const account = (accountId: string) => {
    let a = accounts.get(accountId);
    if (!a) { a = { account_id: accountId, holdings: [], snapshots: [] }; accounts.set(accountId, a); }
    return a;
  };
  for (const h of holdings) {
    const s = bySecurity.get(h.security_id) ?? {};
    account(h.account_id).holdings.push({
      security_id: h.security_id, name: s.name ?? null, ticker: s.ticker ?? null, type: s.type ?? null,
      quantity: Number(h.quantity), price: h.institution_price === null ? null : Number(h.institution_price),
      value: h.institution_value === null ? null : Number(h.institution_value),
      cost_basis: h.cost_basis === null ? null : Number(h.cost_basis),
    });
  }
  for (const s of snapshots) {
    account(s.account_id).snapshots.push({ date: s.date, value: Number(s.value), net_flow: Number(s.net_flow), estimated: s.estimated });
  }
  return [...accounts.values()];
}


