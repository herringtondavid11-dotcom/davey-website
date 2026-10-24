// Minimal Supabase Auth + PostgREST access over fetch, using the service key the platform injects.
import { HttpError } from "./http.ts";
import { mode } from "./mode.ts";

const supabaseURL = mustGetEnv("SUPABASE_URL");

/** The platform's privileged key: the legacy service_role JWT, or the newer `sb_secret_...` key. */
const serviceKey = (() => {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const keys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keys) {
    const parsed = JSON.parse(keys) as Record<string, string>;
    const first = parsed["default"] ?? Object.values(parsed)[0];
    if (first) return first;
  }
  throw new Error("No Supabase service key in environment");
})();

export function serviceHeaders(): Record<string, string> {
  // `sb_secret_` keys are not JWTs and go only in `apikey`; the legacy key is also a bearer token.
  return serviceKey.startsWith("sb_")
    ? { apikey: serviceKey }
    : { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
}

export function mustGetEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

/** The user ID sandbox end-to-end tests act as (sandbox mode only; see `requireUser`). */
export const sandboxTestUserID = "sandbox-e2e-test";

/** Items table: production items, or the separate sandbox table in sandbox mode. */
export function itemsTable(): string {
  return mode.sandbox ? "plaid_items_sandbox" : "plaid_items";
}

/** Constant-time string comparison for the sandbox test token. */
function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Returns the signed-in user's ID from the request's `Authorization: Bearer <access token>`.
 * Sandbox mode only: a request carrying `X-Davey-Sandbox-Token` equal to the DAVEY_SANDBOX_TEST_TOKEN secret acts as
 * `sandboxTestUserID`, so automated UI tests can run without Sign in with Apple. Production functions ignore it.
 */
export async function requireUser(req: Request): Promise<string> {
  if (mode.sandbox) {
    const expected = Deno.env.get("DAVEY_SANDBOX_TEST_TOKEN") ?? "";
    const given = req.headers.get("X-Davey-Sandbox-Token") ?? "";
    if (expected.length >= 32 && given && sameSecret(given, expected)) return sandboxTestUserID;
  }
  const header = req.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new HttpError(401, "unauthorized", "Sign in required.");

  const response = await fetch(`${supabaseURL}/auth/v1/user`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new HttpError(401, "unauthorized", "Session expired. Sign in again.");
  const user = await response.json() as { id?: string; is_anonymous?: boolean };
  if (!user.id) throw new HttpError(401, "unauthorized", "Sign in required.");
  return user.id;
}

export interface PlaidItemRow {
  id: string;
  user_id: string;
  item_id: string;
  access_token_ciphertext: string;
  institution_name: string | null;
  needs_sync?: boolean;
  status?: string;
  status_updated_at?: string | null;
  webhook_set?: boolean;
  investments_status?: string | null;
  investments_synced_at?: string | null;
  /** Latest Plaid error from an investments pull, when the last attempt failed or needs consent. */
  investments_error_code?: string | null;
}

export type ItemState = Partial<Pick<PlaidItemRow, "needs_sync" | "status" | "status_updated_at" | "webhook_set">>;

// ---- Household access: a bank linked by either partner is reachable by both ----

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The user IDs sharing the user's household (just the user when alone, or for the sandbox test user). */
export async function householdUserIDs(userId: string): Promise<string[]> {
  if (!uuidPattern.test(userId)) return [userId];
  const rows = await (await rest(
    `household_members?select=household_id&user_id=eq.${encodeURIComponent(userId)}`,
  )).json() as { household_id: string }[];
  if (rows.length === 0) return [userId];
  const members = await (await rest(
    `household_members?select=user_id&household_id=eq.${rows[0].household_id}`,
  )).json() as { user_id: string }[];
  return members.length ? members.map((m) => m.user_id) : [userId];
}

/** The user's household ID, if they have one. */
export async function householdIDFor(userId: string): Promise<string | null> {
  if (!uuidPattern.test(userId)) return null;
  const rows = await (await rest(
    `household_members?select=household_id&user_id=eq.${encodeURIComponent(userId)}`,
  )).json() as { household_id: string }[];
  return rows[0]?.household_id ?? null;
}

/** Whether the user owns their household (or has none yet, so they're on their own). */
export async function isHouseholdOwner(userId: string): Promise<boolean> {
  if (!uuidPattern.test(userId)) return true;
  const rows = await (await rest(
    `household_members?select=role&user_id=eq.${encodeURIComponent(userId)}`,
  )).json() as { role: string }[];
  return rows.length === 0 || rows[0].role === "owner";
}

function userFilter(ids: string[]): string {
  return ids.length === 1
    ? `user_id=eq.${encodeURIComponent(ids[0])}`
    : `user_id=in.(${ids.map(encodeURIComponent).join(",")})`;
}

/** Whether the items table has `household_id` yet (sandbox: yes; production: after migration part B). Cached. */
let itemsHouseholdColumn: Promise<boolean> | null = null;
function itemsHaveHouseholdColumn(): Promise<boolean> {
  itemsHouseholdColumn ??= fetch(`${supabaseURL}/rest/v1/${itemsTable()}?select=household_id&limit=0`, {
    headers: serviceHeaders(),
  }).then((response) => response.ok).catch(() => false);
  return itemsHouseholdColumn;
}

/** Updates one of the household's Items. */
export async function updateItem(userId: string, itemId: string, fields: ItemState): Promise<void> {
  const ids = await householdUserIDs(userId);
  await rest(`${itemsTable()}?${userFilter(ids)}&item_id=eq.${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ ...fields, updated_at: new Date().toISOString() }),
  });
}

/** Updates an Item by Plaid's item_id alone (webhooks, which carry no user). Returns whether it exists here. */
export async function updateItemByPlaidID(itemId: string, fields: ItemState): Promise<boolean> {
  const response = await rest(`${itemsTable()}?item_id=eq.${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...fields, updated_at: new Date().toISOString() }),
  });
  return ((await response.json()) as unknown[]).length > 0;
}

export async function rest(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`${supabaseURL}/rest/v1/${path}`, {
    ...init,
    headers: { ...serviceHeaders(), "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!response.ok) {
    console.error("Database request failed:", response.status);
    throw new HttpError(500, "database_error", "Couldn't reach the database.");
  }
  return response;
}

/** Calls a Postgres function with the service role. Errors raised in SQL (`raise exception 'code'`) come back as
 * `{ code, message }`; those are returned as `RPCError` so callers can map them to friendly messages. */
export class RPCError extends Error {}

export async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${supabaseURL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { ...serviceHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const text = await response.text();
  if (!response.ok) {
    let message = "";
    try {
      message = (JSON.parse(text) as { message?: string }).message ?? "";
    } catch { /* not JSON */ }
    if (response.status === 400 && /^[a-z_]+$/.test(message)) throw new RPCError(message);
    console.error("RPC failed:", name, response.status);
    throw new HttpError(500, "database_error", "Couldn't reach the database.");
  }
  return (text ? JSON.parse(text) : null) as T;
}

export async function insertItem(row: Omit<PlaidItemRow, "id">): Promise<void> {
  const household = (await itemsHaveHouseholdColumn()) ? { household_id: await householdIDFor(row.user_id) } : {};
  await rest(`${itemsTable()}?on_conflict=item_id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ ...row, ...household, updated_at: new Date().toISOString() }),
  });
}

/** An item linked by anyone in the user's household, or a 404. Always filters by the household's users, so nobody
 * outside it can reach the item. */
export async function getItem(userId: string, itemId: string): Promise<PlaidItemRow> {
  const ids = await householdUserIDs(userId);
  const query = `${itemsTable()}?select=*&${userFilter(ids)}&item_id=eq.${encodeURIComponent(itemId)}`;
  const rows = await (await rest(query)).json() as PlaidItemRow[];
  if (rows.length === 0) throw new HttpError(404, "item_not_found", "That bank connection wasn't found.");
  return rows[0];
}

/** All items in the user's household (both partners' banks; the bank limit is per household). */
export async function listItems(userId: string): Promise<PlaidItemRow[]> {
  const ids = await householdUserIDs(userId);
  return await (await rest(`${itemsTable()}?select=*&${userFilter(ids)}`)).json() as PlaidItemRow[];
}

/** Only the items this user linked (account deletion revokes these, never the partner's). */
export async function listOwnItems(userId: string): Promise<PlaidItemRow[]> {
  return await (await rest(`${itemsTable()}?select=*&user_id=eq.${encodeURIComponent(userId)}`)).json() as PlaidItemRow[];
}

/** Deletes the Auth user. `plaid_items` rows cascade from `auth.users`. */
export async function deleteAuthUser(userId: string): Promise<void> {
  const response = await fetch(`${supabaseURL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: { ...serviceHeaders(), "Content-Type": "application/json" },
  });
  if (!response.ok && response.status !== 404) {
    console.error("Auth user deletion failed:", response.status);
    throw new HttpError(500, "delete_failed", "Couldn't delete your account. Try again.");
  }
}

/** Deletes an item by its row (`item.user_id`), after the caller's permission was checked. */
export async function deleteItem(userId: string, itemId: string): Promise<void> {
  const query = `${itemsTable()}?user_id=eq.${encodeURIComponent(userId)}&item_id=eq.${encodeURIComponent(itemId)}`;
  await rest(query, { method: "DELETE", headers: { Prefer: "return=minimal" } });
}

// ---- Ask AI rate limiting (`ask_ai_requests`: one row per accepted question) ----

/** How many questions the user has asked since `since`. Uses PostgREST's exact count without fetching rows. */
export async function countAskAIRequests(userId: string, since: Date): Promise<number> {
  const query = `ask_ai_requests?select=id&user_id=eq.${encodeURIComponent(userId)}` +
    `&created_at=gte.${encodeURIComponent(since.toISOString())}`;
  const response = await rest(query, { method: "HEAD", headers: { Prefer: "count=exact" } });
  // Content-Range is "0-4/5" or "*/0"; the total follows the slash.
  const total = Number(response.headers.get("Content-Range")?.split("/")[1]);
  if (!Number.isFinite(total)) throw new HttpError(500, "database_error", "Couldn't reach the database.");
  return total;
}

export async function recordAskAIRequest(userId: string): Promise<void> {
  await rest("ask_ai_requests", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ user_id: userId }),
  });
}

export interface AIUsageRow {
  question_id: string;
  user_id: string | null;
  round: number;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost_usd: number;
  latency_ms: number;
  outcome: string;
}

/** Questions (round 0 of each) asked by anyone in the user's household since `since` (caps are per household). */
export async function countAIQuestions(userId: string, since: Date): Promise<number> {
  const ids = await householdUserIDs(userId);
  const query = `ai_usage?select=id&${userFilter(ids)}&round=eq.0` +
    `&outcome=neq.error&created_at=gte.${encodeURIComponent(since.toISOString())}`;
  const response = await rest(query, { method: "HEAD", headers: { Prefer: "count=exact" } });
  const total = Number(response.headers.get("Content-Range")?.split("/")[1]);
  if (!Number.isFinite(total)) throw new HttpError(500, "database_error", "Couldn't reach the database.");
  return total;
}

export async function recordAIUsage(row: AIUsageRow): Promise<void> {
  await rest("ai_usage", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(row) });
}


