// Davey Premium on the server: plan limits for bank connections and Davey AI, from `subscription_entitlements`.
// The numbers match the app's PlanLimits (Davey/Store/PlanLimits.swift).
import { HttpError } from "./http.ts";
import { BUNDLE_ID, type TransactionInfo } from "./appstore.ts";
import { rest } from "./supabase.ts";

/** Mirrors the app's FeatureFlags.paywallEnabled. While false, everyone gets Premium limits. Flip both at launch. */
export const PAYWALL_ENABLED = false;

export const LIMITS = {
  free: { bankConnections: 1, askAIPerMonth: 5 },
  premium: { bankConnections: 10, askAIPerMonth: 100 },
} as const;

export const PREMIUM_PRODUCT_IDS = new Set(["davey.premium.monthly", "davey.premium.annual"]);

export interface EntitlementRow {
  original_transaction_id: string;
  user_id: string | null;
  product_id: string;
  environment: string;
  expires_at: string | null;
  revoked_at: string | null;
  last_event: string;
  signed_at: string;
}

/** Whether `row` grants Premium at `now`: not refunded or revoked, and not expired. */
export function isActive(row: Pick<EntitlementRow, "expires_at" | "revoked_at">, now = new Date()): boolean {
  if (row.revoked_at) return false;
  return row.expires_at !== null && new Date(row.expires_at) > now;
}

/** Days a household member keeps Premium after the owner's subscription ends. */
export const GRACE_DAYS = 7;

/** Whether a member still inherits Premium from the owner's rows: active, or ended less than GRACE_DAYS ago. */
export function inheritsPremium(ownerRows: Pick<EntitlementRow, "expires_at" | "revoked_at">[], now = new Date()): boolean {
  if (ownerRows.some((row) => isActive(row, now))) return true;
  const ends = ownerRows.map((row) => row.revoked_at ?? row.expires_at).filter((d): d is string => !!d)
    .map((d) => new Date(d).getTime());
  return ends.length > 0 && Math.max(...ends) + GRACE_DAYS * 86_400_000 > now.getTime();
}

async function entitlementRowsFor(userId: string): Promise<Pick<EntitlementRow, "expires_at" | "revoked_at">[]> {
  const response = await rest(
    `subscription_entitlements?select=expires_at,revoked_at&user_id=eq.${encodeURIComponent(userId)}`,
  );
  return await response.json() as Pick<EntitlementRow, "expires_at" | "revoked_at">[];
}

/** Premium from the user's own subscription, or inherited from their household's owner (with the grace period). */
export async function isPremium(userId: string, now = new Date()): Promise<boolean> {
  if (!PAYWALL_ENABLED) return true;
  if (!isUUID(userId)) return false;
  if ((await entitlementRowsFor(userId)).some((row) => isActive(row, now))) return true;
  const membership = await (await rest(
    `household_members?select=role,households(owner_id)&user_id=eq.${encodeURIComponent(userId)}`,
  )).json() as { role: string; households: { owner_id: string } | null }[];
  const ownerId = membership[0]?.role === "member" ? membership[0].households?.owner_id : undefined;
  return ownerId ? inheritsPremium(await entitlementRowsFor(ownerId), now) : false;
}

export async function limitsFor(userId: string) {
  return (await isPremium(userId)) ? { premium: true, ...LIMITS.premium } : { premium: false, ...LIMITS.free };
}

export function isUUID(value: string | undefined | null): value is string {
  return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** The row a verified transaction produces (null when it isn't a Davey Premium transaction for this app). */
export function rowFor(
  transaction: TransactionInfo,
  userId: string | null,
  event: string,
  signedAt: number,
): EntitlementRow | null {
  if (transaction.bundleId !== BUNDLE_ID || !PREMIUM_PRODUCT_IDS.has(transaction.productId)) return null;
  return {
    original_transaction_id: transaction.originalTransactionId,
    user_id: userId,
    product_id: transaction.productId,
    environment: transaction.environment ?? "Production",
    expires_at: transaction.expiresDate ? new Date(transaction.expiresDate).toISOString() : null,
    revoked_at: transaction.revocationDate ? new Date(transaction.revocationDate).toISOString() : null,
    last_event: event,
    signed_at: new Date(signedAt).toISOString(),
  };
}

/** Saves `row` unless the stored one is newer. Keeps an existing user when the new data doesn't name one. */
export async function saveEntitlement(row: EntitlementRow): Promise<void> {
  const existingResponse = await rest(
    `subscription_entitlements?select=user_id,signed_at&original_transaction_id=eq.${encodeURIComponent(row.original_transaction_id)}`,
  );
  const [existing] = await existingResponse.json() as { user_id: string | null; signed_at: string }[];
  if (existing && new Date(existing.signed_at) > new Date(row.signed_at)) return;
  const merged = { ...row, user_id: row.user_id ?? existing?.user_id ?? null, updated_at: new Date().toISOString() };
  await rest("subscription_entitlements?on_conflict=original_transaction_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(merged),
  });
  if (merged.user_id) await refreshOwnedHousehold(merged.user_id);
}

/** When an owner's subscription changes, update what their partner may do (Premium, grace, then read-only).
 * Imported lazily: household.ts depends on this module. Never fails the subscription update itself. */
async function refreshOwnedHousehold(ownerId: string): Promise<void> {
  try {
    const rows = await (await rest(`households?select=*&owner_id=eq.${encodeURIComponent(ownerId)}`)).json();
    if (Array.isArray(rows) && rows.length) {
      const { refreshMemberAccess } = await import("./household.ts");
      await refreshMemberAccess(rows[0]);
    }
  } catch (error) {
    console.error("Household access refresh failed:", error instanceof Error ? error.name : typeof error);
  }
}

/** The friendly message when a plan limit is reached (HTTP 402 with code "plan_limit"). */
export function planLimitError(message: string): HttpError {
  return new HttpError(402, "plan_limit", message);
}
