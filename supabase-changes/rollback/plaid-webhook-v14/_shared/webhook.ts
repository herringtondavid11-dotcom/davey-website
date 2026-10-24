// Plaid webhook verification (https://plaid.com/docs/api/webhooks/webhook-verification/): the Plaid-Verification
// header is a JWT (ES256) signed with a key from /webhook_verification_key/get; its claims carry the SHA-256 of the
// raw body and the time it was issued. Webhooks older than 5 minutes or with a different body are rejected.
import { plaid } from "./plaid.ts";

export class WebhookVerificationError extends Error {}

type JWK = JsonWebKey & { kid?: string; expired_at?: number | null };
export type KeyFetcher = (keyID: string) => Promise<JWK>;

const keyCache = new Map<string, JWK>();

/** Plaid's verification key, cached per key ID (they rotate rarely). */
export const fetchPlaidKey: KeyFetcher = async (keyID) => {
  const cached = keyCache.get(keyID);
  if (cached) return cached;
  const result = await plaid<{ key: JWK }>("/webhook_verification_key/get", { key_id: keyID });
  keyCache.set(keyID, result.key);
  return result.key;
};

function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4)), (c) => c.charCodeAt(0));
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyPlaidWebhook(
  rawBody: string,
  verificationHeader: string | null,
  fetchKey: KeyFetcher = fetchPlaidKey,
  now = Date.now(),
): Promise<void> {
  if (!verificationHeader) throw new WebhookVerificationError("missing Plaid-Verification");
  const parts = verificationHeader.split(".");
  if (parts.length !== 3) throw new WebhookVerificationError("malformed JWT");
  let header: { alg?: string; kid?: string };
  let claims: { iat?: number; request_body_sha256?: string };
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])));
    claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));
  } catch {
    throw new WebhookVerificationError("malformed JWT");
  }
  if (header.alg !== "ES256" || !header.kid) throw new WebhookVerificationError("unexpected algorithm");
  const jwk = await fetchKey(header.kid);
  if (jwk.expired_at) throw new WebhookVerificationError("expired key");
  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    base64UrlDecode(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!valid) throw new WebhookVerificationError("bad signature");
  if (typeof claims.iat !== "number" || now / 1000 - claims.iat > 5 * 60) throw new WebhookVerificationError("too old");
  if (claims.request_body_sha256 !== await sha256Hex(rawBody)) throw new WebhookVerificationError("body mismatch");
}

/** What a webhook means for the Item: an update to sync, or a connection problem the user must fix. */
export function itemStateFor(webhook: {
  webhook_type?: string;
  webhook_code?: string;
  error?: { error_code?: string } | null;
}): { needs_sync?: boolean; status?: string } | null {
  const type = webhook.webhook_type, code = webhook.webhook_code;
  if (type === "TRANSACTIONS" && code === "SYNC_UPDATES_AVAILABLE") return { needs_sync: true };
  // New loan/card details (also flags the stored copy stale; see plaid-webhook).
  if (type === "LIABILITIES" && code === "DEFAULT_UPDATE") return { needs_sync: true };
  if (type !== "ITEM") return null;
  switch (code) {
    case "ERROR":
      return webhook.error?.error_code === "ITEM_LOGIN_REQUIRED" ? { status: "login_required" } : null;
    case "LOGIN_REPAIRED":
      return { status: "ok", needs_sync: true };
    case "PENDING_EXPIRATION":
      return { status: "pending_expiration" };
    case "PENDING_DISCONNECT":
      return { status: "pending_disconnect" };
    case "USER_PERMISSION_REVOKED":
    case "USER_ACCOUNT_REVOKED":
      return { status: "revoked" };
    case "NEW_ACCOUNTS_AVAILABLE":
      return { needs_sync: true };
    default:
      return null;
  }
}
