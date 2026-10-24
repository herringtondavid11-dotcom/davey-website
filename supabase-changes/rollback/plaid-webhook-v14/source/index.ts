// Plaid webhooks (the URL is set on every Link token and on older Items at their next sync). Verified with Plaid's
// signed JWT before anything changes. SYNC_UPDATES_AVAILABLE marks the Item for the app to sync; ITEM errors
// (ITEM_LOGIN_REQUIRED, PENDING_EXPIRATION, PENDING_DISCONNECT, revoked) mark it for Reconnect in the app
// (`plaid-item-status`). Logs the webhook type and code only. Always answers 200 once verified, so Plaid doesn't retry.
import { json } from "../_shared/http.ts";
import { itemStateFor, verifyPlaidWebhook, WebhookVerificationError } from "../_shared/webhook.ts";
import { itemsTable, rest, updateItemByPlaidID } from "../_shared/supabase.ts";
import { syncInvestments } from "../_shared/investments.ts";
import { decrypt } from "../_shared/crypto.ts";
import { PlaidError } from "../_shared/plaid.ts";
import { markLiabilitiesStale } from "../_shared/liabilities.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const raw = await req.text();
  try {
    await verifyPlaidWebhook(raw, req.headers.get("Plaid-Verification"));
  } catch (error) {
    const reason = error instanceof WebhookVerificationError ? error.message : "verification failed";
    console.error(`plaid-webhook: rejected (${reason})`);
    return json({ error: "unverified" }, 401);
  }
  let body: { webhook_type?: string; webhook_code?: string; item_id?: string; error?: { error_code?: string } | null };
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const state = itemStateFor(body);
  let known = false;
  if (state && body.item_id) {
    known = await updateItemByPlaidID(body.item_id, {
      ...state,
      ...(state.status ? { status_updated_at: new Date().toISOString() } : {}),
    });
  }
  if (body.webhook_type === "LIABILITIES" && body.webhook_code === "DEFAULT_UPDATE" && body.item_id) {
    try {
      await markLiabilitiesStale(body.item_id);
    } catch {
      console.error("plaid-webhook: couldn't mark liabilities stale");
    }
  }
  // New holdings or investment transactions: pull and store them now (all of the household's devices read them).
  if ((body.webhook_type === "HOLDINGS" || body.webhook_type === "INVESTMENTS_TRANSACTIONS") &&
      body.webhook_code === "DEFAULT_UPDATE" && body.item_id) {
    try {
      const rows = await (await rest(`${itemsTable()}?select=user_id,item_id,access_token_ciphertext&item_id=eq.${encodeURIComponent(body.item_id)}`)).json() as
        { user_id: string; item_id: string; access_token_ciphertext: string }[];
      if (rows[0]) {
        await syncInvestments(rows[0], await decrypt(rows[0].access_token_ciphertext), itemsTable(),
                              { transactions: body.webhook_type === "INVESTMENTS_TRANSACTIONS" });
      }
    } catch (error) {
      const code = error instanceof PlaidError ? error.code : "unknown";
      console.error(`plaid-webhook: investments sync failed ${code}`);
    }
  }
  console.log(`plaid-webhook: ${body.webhook_type}/${body.webhook_code}${body.error?.error_code ? ` ${body.error.error_code}` : ""} applied=${!!state} item_known=${known}`);
  return json({ ok: true });
});
