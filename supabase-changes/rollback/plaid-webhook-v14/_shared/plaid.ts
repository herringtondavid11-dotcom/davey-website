// Plaid API client and conversion to the app's wire format.
import type { LiabilityDetails } from "./liabilities.ts";
import { HttpError } from "./http.ts";
import { mode } from "./mode.ts";

const environments: Record<string, string> = {
  sandbox: "https://sandbox.plaid.com",
  production: "https://production.plaid.com",
};

/** The Plaid host and secret for this function: PLAID_ENV / PLAID_SECRET, or Sandbox in sandbox mode. */
function plaidConfig(): { baseURL: string; secret: string | undefined } {
  if (mode.sandbox) {
    return { baseURL: environments.sandbox, secret: Deno.env.get("PLAID_SANDBOX_SECRET") };
  }
  const env = Deno.env.get("PLAID_ENV") ?? "sandbox";
  const baseURL = environments[env];
  if (!baseURL) throw new Error(`Unknown PLAID_ENV "${env}"`);
  return { baseURL, secret: Deno.env.get("PLAID_SECRET") };
}

export class PlaidError extends Error {
  constructor(
    readonly code: string,
    readonly type: string,
    readonly status: number,
    /** Plaid's developer-facing explanation. */
    readonly plaidMessage: string,
    /** Plaid's end-user-facing text, when it provides one. */
    readonly displayMessage: string | null,
    readonly requestId: string | null,
  ) {
    super(code);
  }
}

export async function plaid<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const { baseURL, secret } = plaidConfig();
  if (!secret) throw new HttpError(500, "server_misconfigured", "The server's Plaid keys are missing.");
  const response = await fetch(`${baseURL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: Deno.env.get("PLAID_CLIENT_ID"),
      secret,
      ...body,
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new PlaidError(
      data.error_code ?? "UNKNOWN",
      data.error_type ?? "UNKNOWN",
      response.status,
      data.error_message ?? "",
      data.display_message ?? null,
      data.request_id ?? null,
    );
    // Code, type, and request ID only; the message can echo request details.
    console.error(`Plaid ${path} failed: ${error.type}/${error.code} request_id=${error.requestId}`);
    throw error;
  }
  return data as T;
}

/** Maps Plaid failures the app can act on to HTTP errors; everything else becomes a generic 502. */
export function toHttpError(error: unknown): unknown {
  if (!(error instanceof PlaidError)) return error;
  switch (error.code) {
    case "ITEM_LOGIN_REQUIRED":
    case "PENDING_EXPIRATION":
    case "PENDING_DISCONNECT":
      return new HttpError(409, "item_login_required", "This bank needs you to sign in again.");
    case "ITEM_NOT_FOUND":
      return new HttpError(404, "item_not_found", "That bank connection no longer exists.");
    case "INVALID_ACCESS_TOKEN":
      // e.g. a Sandbox connection after switching the server to Production.
      return new HttpError(404, "item_not_found", "This bank connection is no longer valid. Disconnect it and connect again.");
    case "INVALID_PUBLIC_TOKEN":
      return new HttpError(400, "invalid_public_token", "The bank connection expired. Try connecting again.");
    case "INVALID_API_KEYS":
      return new HttpError(500, "server_misconfigured", "The server's Plaid keys are invalid.");
    default:
      // Surface Plaid's own explanation (with its code) so problems can be diagnosed from the app.
      return new HttpError(
        502,
        "plaid_error",
        `${error.displayMessage ?? error.plaidMessage} (Plaid ${error.code}${error.requestId ? `, request ${error.requestId}` : ""})`,
      );
  }
}

// ---- Wire format sent to the app (amounts in integer cents, app sign convention) ----

interface PlaidBalances {
  current: number | null;
  available: number | null;
  /** Credit limit (credit cards), when the bank reports it. */
  limit?: number | null;
  iso_currency_code: string | null;
}

export interface PlaidAccount {
  account_id: string;
  name: string;
  official_name: string | null;
  mask: string | null;
  type: string;
  subtype: string | null;
  balances: PlaidBalances;
}

export interface PlaidTransaction {
  transaction_id: string;
  account_id: string;
  amount: number;
  iso_currency_code: string | null;
  date: string;
  authorized_date: string | null;
  name: string;
  merchant_name: string | null;
  pending: boolean;
  /** On a posted transaction: the ID of the pending one it replaces. */
  pending_transaction_id?: string | null;
  personal_finance_category: { primary: string; detailed: string } | null;
}

/** Plaid amounts are decimal dollars; cents avoid floating point in the app. */
export function toCents(amount: number | null): number | null {
  return amount === null ? null : Math.round(amount * 100);
}

/** `details` from Plaid Liabilities; `liabilitiesStatus` tells the app when a loan's bank doesn't provide them. */
export function toAppAccount(account: PlaidAccount, details?: LiabilityDetails, liabilitiesStatus?: string) {
  return {
    account_id: account.account_id,
    name: account.name,
    official_name: account.official_name,
    mask: account.mask,
    type: account.type,
    subtype: account.subtype,
    current_balance_cents: toCents(account.balances.current),
    available_balance_cents: toCents(account.balances.available),
    limit_cents: toCents(account.balances.limit ?? null),
    iso_currency_code: account.balances.iso_currency_code,
    ...(details ?? {}),
    liabilities_status: liabilitiesStatus ?? null,
  };
}

/** Plaid: positive = money leaving the account. App: negative = outflow. */
export function toAppTransaction(transaction: PlaidTransaction) {
  return {
    transaction_id: transaction.transaction_id,
    account_id: transaction.account_id,
    amount_cents: -(toCents(transaction.amount) ?? 0),
    iso_currency_code: transaction.iso_currency_code,
    date: transaction.authorized_date ?? transaction.date,
    name: transaction.merchant_name ?? transaction.name,
    pending: transaction.pending,
    pending_transaction_id: transaction.pending_transaction_id ?? null,
    category_primary: transaction.personal_finance_category?.primary ?? null,
    category_detailed: transaction.personal_finance_category?.detailed ?? null,
  };
}

/** Where Plaid sends this environment's webhooks (the sandbox functions get the sandbox twin). */
export function webhookURL(): string | undefined {
  const base = Deno.env.get("SUPABASE_URL");
  return base ? `${base}/functions/v1/plaid-webhook${mode.sandbox ? "-sandbox" : ""}` : undefined;
}


