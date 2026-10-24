// Household Sharing: invite codes, the redeem rate limit, member access from the owner's subscription, and the
// database calls the household-* functions share. Pure helpers are exported for tests.
import { HttpError } from "./http.ts";
import { GRACE_DAYS, isActive, PAYWALL_ENABLED, type EntitlementRow } from "./entitlement.ts";
import { rest, rpc, RPCError } from "./supabase.ts";
export { GRACE_DAYS };

/** Uppercase letters and digits without the look-alikes O, 0, I and 1 (32 characters, 5 bits each). */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 8;
export const INVITE_TTL_HOURS = 48;
export const REDEEM_MAX_FAILURES = 5;
export const REDEEM_WINDOW_MS = 60 * 60 * 1000;

/** A random 8-character code (crypto RNG; 256 is a multiple of 32, so there's no modulo bias). */
export function generateCode(random: (bytes: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b)): string {
  const bytes = random(new Uint8Array(CODE_LENGTH));
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
}

/** "ABCD-EFGH" for display. */
export function formatCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4, 8)}`;
}

/** What the user typed → the 8 code characters, or null when it can't be a code. Accepts lowercase, spaces and
 * dashes. O, 0, I and 1 never appear in a code, so a code containing them is invalid. */
export function normalizeCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, "");
  if (code.length !== CODE_LENGTH) return null;
  for (const char of code) if (!CODE_ALPHABET.includes(char)) return null;
  return code;
}

/** SHA-256 (hex) of the normalized code: the only form stored. */
export async function hashCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`davey-household:${code}`));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** When the user may try again: after 5 failed attempts within an hour, locked until an hour after the 5th. */
export function redeemLockedUntil(failedAttempts: Date[], now = new Date()): Date | null {
  const recent = failedAttempts
    .filter((date) => now.getTime() - date.getTime() < REDEEM_WINDOW_MS)
    .sort((a, b) => a.getTime() - b.getTime());
  if (recent.length < REDEEM_MAX_FAILURES) return null;
  const until = new Date(recent[recent.length - REDEEM_MAX_FAILURES].getTime() + REDEEM_WINDOW_MS);
  return until > now ? until : null;
}

export type MemberAccess =
  | { state: "premium"; until: null }
  | { state: "grace"; until: Date }
  | { state: "readOnly"; until: Date };

/**
 * What the member gets from the owner's subscription. Premium while any of the owner's subscriptions is active;
 * after the last one ends, a 7-day grace period; then Free in read-only household mode. While the paywall is off,
 * everyone has Premium, so the member always does too.
 */
export function memberAccess(
  ownerRows: Pick<EntitlementRow, "expires_at" | "revoked_at">[],
  now = new Date(),
  paywallEnabled = PAYWALL_ENABLED,
): MemberAccess {
  if (!paywallEnabled || ownerRows.some((row) => isActive(row, now))) return { state: "premium", until: null };
  const ended = ownerRows
    .map((row) => row.revoked_at ?? row.expires_at)
    .filter((date): date is string => !!date)
    .map((date) => new Date(date).getTime());
  const lastEnd = ended.length ? Math.max(...ended) : 0;
  const graceEnd = new Date(lastEnd + GRACE_DAYS * 24 * 60 * 60 * 1000);
  return graceEnd > now ? { state: "grace", until: graceEnd } : { state: "readOnly", until: graceEnd };
}

/** The `households.member_access_until` value for an access state (null = unlimited). */
export function accessUntil(access: MemberAccess): string | null {
  return access.until ? access.until.toISOString() : null;
}

/** User-facing messages for the codes the SQL functions raise. */
export const REDEEM_ERRORS: Record<string, [number, string]> = {
  invalid_code: [404, "That code isn't valid. Check it and try again."],
  revoked: [410, "That code was cancelled. Ask for a new one."],
  expired: [410, "That code has expired. Ask for a new one."],
  already_used: [409, "That code has already been used. Ask for a new one."],
  household_full: [409, "That household already has two people."],
  already_member: [409, "You're already in this household."],
  in_household_with_data: [409, "You're already sharing a household with someone. Leave it first, then join."],
  owner_has_partner: [409, "You're sharing your household with a partner. Remove them first, then join."],
  not_owner: [403, "Only the household owner can do that."],
  no_member: [404, "There's no partner to remove."],
  not_member: [404, "You're not in a shared household."],
  owner_cannot_leave: [409, "You own this household. Remove your partner instead."],
  rate_limited: [429, "Too many attempts. Try again in an hour."],
  premium_required: [402, "Household Sharing is a Premium feature."],
};

export function householdError(code: string): HttpError {
  const [status, message] = REDEEM_ERRORS[code] ?? [400, "Something went wrong."];
  return new HttpError(status, code, message);
}

/** Runs a household SQL function, turning its raised codes into friendly HTTP errors. */
export async function householdRPC<T>(name: string, args: Record<string, unknown>): Promise<T> {
  try {
    return await rpc<T>(name, args);
  } catch (error) {
    if (error instanceof RPCError) throw householdError(error.message);
    throw error;
  }
}

export interface HouseholdMember {
  user_id: string;
  role: "owner" | "member";
  display_name: string;
  hide_ai_history: boolean;
  joined_at: string;
}

export interface HouseholdRow {
  id: string;
  owner_id: string;
  name: string;
  member_access_until: string | null;
}

/** The user's household (created on first use) with its members. */
export async function householdFor(userId: string, name = ""): Promise<{ household: HouseholdRow; members: HouseholdMember[] }> {
  const id = await householdRPC<string>("household_ensure", { p_user: userId, p_name: name });
  const [household] = await (await rest(`households?select=*&id=eq.${id}`)).json() as HouseholdRow[];
  const members = await (await rest(
    `household_members?select=user_id,role,display_name,hide_ai_history,joined_at&household_id=eq.${id}&order=joined_at`,
  )).json() as HouseholdMember[];
  return { household, members };
}

/** The owner's entitlement rows. */
export async function entitlementRows(userId: string): Promise<Pick<EntitlementRow, "expires_at" | "revoked_at">[]> {
  return await (await rest(
    `subscription_entitlements?select=expires_at,revoked_at&user_id=eq.${encodeURIComponent(userId)}`,
  )).json() as Pick<EntitlementRow, "expires_at" | "revoked_at">[];
}

/** Recomputes the member's access from the owner's subscription and stores it (the RLS write check reads it). */
export async function refreshMemberAccess(household: HouseholdRow, now = new Date()): Promise<MemberAccess> {
  const access = memberAccess(await entitlementRows(household.owner_id), now);
  const until = accessUntil(access);
  if (until !== household.member_access_until) {
    await rest(`households?id=eq.${household.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ member_access_until: until }),
    });
  }
  return access;
}
