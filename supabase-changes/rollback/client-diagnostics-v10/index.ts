// Crash, hang and error reports from the app: MetricKit summaries and handled-error codes, keyed by an anonymous
// per-install diagnostic ID (never a user). Body: { diagnostic_id, kind: "crash"|"hang"|"error"|"launch", app_version,
// os_version, device, payload: {...} }. At most 50 reports per install per day and 16 KB each; no financial data.
import { handle, HttpError, json, requireString } from "../_shared/http.ts";
import { rest } from "../_shared/supabase.ts";
import { isUUID } from "../_shared/entitlement.ts";

// link_event: one Plaid Link event (codes, MFA type, institution, session and request IDs; never credentials or answers).
const KINDS = new Set(["crash", "hang", "error", "launch", "link_event"]);
const PER_DAY = 200;
const MAX_PAYLOAD_BYTES = 16_000;

Deno.serve(handle(async (_req, body) => {
  const diagnosticId = requireString(body, "diagnostic_id");
  const kind = requireString(body, "kind");
  if (!isUUID(diagnosticId) || !KINDS.has(kind)) throw new HttpError(400, "invalid_request", "Unknown report.");
  const payload = body.payload ?? {};
  if (typeof payload !== "object" || JSON.stringify(payload).length > MAX_PAYLOAD_BYTES) {
    throw new HttpError(413, "too_large", "Report too large.");
  }
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const counted = await rest(
    `client_diagnostics?select=id&diagnostic_id=eq.${diagnosticId}&created_at=gte.${encodeURIComponent(since)}`,
    { method: "HEAD", headers: { Prefer: "count=exact" } },
  );
  if (Number(counted.headers.get("Content-Range")?.split("/")[1] ?? 0) >= PER_DAY) return json({ stored: false });
  const text = (key: string) => typeof body[key] === "string" ? (body[key] as string).slice(0, 64) : null;
  await rest("client_diagnostics", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      diagnostic_id: diagnosticId, kind, app_version: text("app_version"), os_version: text("os_version"),
      device: text("device"), payload,
    }),
  });
  console.log(`client-diagnostics: ${kind} ${text("app_version")}`);
  return json({ stored: true });
}));
