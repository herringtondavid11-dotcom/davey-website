// functions/_shared/monitor.ts
var ALERT_THRESHOLD = 10;
var ALERT_WINDOW_MINUTES = 15;
var ALERT_COOLDOWN_MINUTES = 60;
function serviceKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const keys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!keys) return void 0;
  try {
    const parsed = JSON.parse(keys);
    return parsed["default"] ?? Object.values(parsed)[0];
  } catch {
    return void 0;
  }
}
async function db(path, init = {}) {
  const base = Deno.env.get("SUPABASE_URL"), key = serviceKey();
  if (!base || !key) return null;
  return await fetch(`${base}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...init.headers ?? {} }
  });
}
async function count(path) {
  const response = await db(path, { method: "HEAD", headers: { Prefer: "count=exact" } });
  return Number(response?.headers.get("Content-Range")?.split("/")[1] ?? 0) || 0;
}
function shouldAlert(recentErrors, minutesSinceLastAlert) {
  return recentErrors >= ALERT_THRESHOLD && (minutesSinceLastAlert === null || minutesSinceLastAlert >= ALERT_COOLDOWN_MINUTES);
}
async function recordFunctionError(functionName2, code, status) {
  try {
    await db("function_errors", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ function_name: functionName2, code, status })
    });
    const since = new Date(Date.now() - ALERT_WINDOW_MINUTES * 6e4).toISOString();
    const recent = await count(`function_errors?select=id&created_at=gte.${encodeURIComponent(since)}`);
    if (recent < ALERT_THRESHOLD) return;
    const last = await (await db("alerts_sent?select=created_at&kind=eq.function_errors&order=created_at.desc&limit=1"))?.json();
    const minutes = last?.[0] ? (Date.now() - Date.parse(last[0].created_at)) / 6e4 : null;
    if (!shouldAlert(recent, minutes)) return;
    const detail = `${recent} Edge Function errors in ${ALERT_WINDOW_MINUTES} min; latest ${functionName2} ${code} (${status})`;
    await db("alerts_sent", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ kind: "function_errors", detail }) });
    await sendAlertEmail("Davey: Edge Functions are failing", `${detail}.

See Supabase \u203A Edge Functions \u203A Logs and the function_errors table.`);
  } catch {
    console.error("monitor: couldn't record the error");
  }
}
async function sendAlertEmail(subject, text) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const to = Deno.env.get("ALERT_EMAIL") ?? "herringtondavid11@gmail.com";
  console.error(`ALERT: ${subject}`);
  if (!apiKey) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: Deno.env.get("ALERT_FROM") ?? "Davey Alerts <onboarding@resend.dev>", to: [to], subject, text })
  });
}

// functions/_shared/http.ts
var HttpError = class extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
  status;
  code;
};
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
function handle(fn) {
  return async (req) => {
    if (req.method !== "POST") {
      return json({ error: "method_not_allowed", message: "Use POST." }, 405);
    }
    try {
      let body = {};
      const text = await req.text();
      if (text) {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed;
      }
      return await fn(req, body);
    } catch (error) {
      if (error instanceof HttpError) {
        if (error.status >= 500) await recordFunctionError(functionName(req), error.code, error.status);
        return json({ error: error.code, message: error.message }, error.status);
      }
      if (error instanceof SyntaxError) {
        return json({ error: "invalid_json", message: "Request body must be JSON." }, 400);
      }
      console.error("Unhandled error:", error instanceof Error ? error.name : typeof error);
      await recordFunctionError(functionName(req), error instanceof Error ? error.name : "unknown", 500);
      return json({ error: "internal", message: "Something went wrong." }, 500);
    }
  };
}
function functionName(req) {
  try {
    return new URL(req.url).pathname.split("/").filter(Boolean).pop() ?? "unknown";
  } catch {
    return "unknown";
  }
}
function requireString(body, key) {
  const value = body[key];
  if (typeof value !== "string" || value.length === 0 || value.length > 512) {
    throw new HttpError(400, "invalid_request", `Missing or invalid "${key}".`);
  }
  return value;
}

// functions/_shared/supabase.ts
var supabaseURL = mustGetEnv("SUPABASE_URL");
var serviceKey2 = (() => {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const keys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keys) {
    const parsed = JSON.parse(keys);
    const first = parsed["default"] ?? Object.values(parsed)[0];
    if (first) return first;
  }
  throw new Error("No Supabase service key in environment");
})();
function serviceHeaders() {
  return serviceKey2.startsWith("sb_") ? { apikey: serviceKey2 } : { apikey: serviceKey2, Authorization: `Bearer ${serviceKey2}` };
}
function mustGetEnv(name) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}
async function rest(path, init = {}) {
  const response = await fetch(`${supabaseURL}/rest/v1/${path}`, {
    ...init,
    headers: { ...serviceHeaders(), "Content-Type": "application/json", ...init.headers ?? {} }
  });
  if (!response.ok) {
    console.error("Database request failed:", response.status);
    throw new HttpError(500, "database_error", "Couldn't reach the database.");
  }
  return response;
}

// functions/_shared/redact.ts
var SECRET_KEY = /token|secret|password|credential|routing|account_number/i;
function redactTokens(value) {
  if (Array.isArray(value)) return value.map(redactTokens);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    out[key] = SECRET_KEY.test(key) ? "[redacted]" : redactTokens(child);
  }
  return out;
}

// functions/client-diagnostics/index.ts
var KINDS = /* @__PURE__ */ new Set(["crash", "hang", "error", "launch", "link_event"]);
var PER_DAY = 200;
var MAX_PAYLOAD_BYTES = 16e3;
var APP_ORIGINS = ["https://daveypersonalfinance.com", "https://www.daveypersonalfinance.com"];
function isUUID(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
function corsHeaders(req) {
  const headers = new Headers();
  const origin = req.headers.get("Origin") ?? "";
  if (!APP_ORIGINS.includes(origin)) return headers;
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Vary", "Origin");
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "content-type, apikey, authorization, x-client-info, x-davey-install-token");
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
}
var inner = handle(async (_req, body) => {
  const diagnosticId = requireString(body, "diagnostic_id");
  const kind = requireString(body, "kind");
  if (!isUUID(diagnosticId) || !KINDS.has(kind)) throw new HttpError(400, "invalid_request", "Unknown report.");
  const rawPayload = body.payload ?? {};
  const payload = kind === "link_event" ? redactTokens(rawPayload) : rawPayload;
  if (typeof payload !== "object" || JSON.stringify(payload).length > MAX_PAYLOAD_BYTES) {
    throw new HttpError(413, "too_large", "Report too large.");
  }
  const since = new Date(Date.now() - 864e5).toISOString();
  const counted = await rest(
    `client_diagnostics?select=id&diagnostic_id=eq.${diagnosticId}&created_at=gte.${encodeURIComponent(since)}`,
    { method: "HEAD", headers: { Prefer: "count=exact" } }
  );
  if (Number(counted.headers.get("Content-Range")?.split("/")[1] ?? 0) >= PER_DAY) return json({ stored: false });
  const text = (key) => typeof body[key] === "string" ? body[key].slice(0, 64) : null;
  await rest("client_diagnostics", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      diagnostic_id: diagnosticId,
      kind,
      app_version: text("app_version"),
      os_version: text("os_version"),
      device: text("device"),
      payload
    })
  });
  console.log(`client-diagnostics: ${kind} ${text("app_version")}`);
  return json({ stored: true });
});
Deno.serve(async (req) => {
  const headers = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  const response = await inner(req);
  headers.forEach((value, name) => response.headers.set(name, value));
  return response;
});
