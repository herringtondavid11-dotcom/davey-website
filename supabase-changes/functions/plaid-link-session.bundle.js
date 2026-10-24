// fn/_shared/monitor.ts
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

See Supabase › Edge Functions › Logs and the function_errors table.`);
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

// fn/_shared/http.ts
var HttpError = class extends Error {
  constructor(status, code, message, retryAfterSeconds) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
};
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
var corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info, x-davey-install-token"
};
var APP_ORIGINS = ["https://daveypersonalfinance.com", "https://www.daveypersonalfinance.com"];
function appCorsHeaders(origin) {
  if (!origin || !APP_ORIGINS.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info, x-davey-install-token",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}
function handle(fn, options = {}) {
  if (options.cors === "app") {
    const inner = handle(fn);
    return async (req) => {
      const headers = appCorsHeaders(req.headers.get("Origin"));
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
      const response = await inner(req);
      for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
      return response;
    };
  }
  if (options.cors) {
    const inner = handle(fn);
    return async (req) => {
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
      const response = await inner(req);
      for (const [name, value] of Object.entries(corsHeaders)) response.headers.set(name, value);
      return response;
    };
  }
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
        const body = { error: error.code, message: error.message };
        if (error.retryAfterSeconds != null) body.retry_after = error.retryAfterSeconds;
        return json(body, error.status);
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

// fn/_shared/accesspin.ts
async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// fn/_shared/mode.ts
var mode = { sandbox: false };

// fn/_shared/supabase.ts
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
var sandboxTestUserID = "sandbox-e2e-test";
function sameSecret(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function sessionUserID(req) {
  if (mode.sandbox) {
    const expected = Deno.env.get("DAVEY_SANDBOX_TEST_TOKEN") ?? "";
    const given = req.headers.get("X-Davey-Sandbox-Token") ?? "";
    if (expected.length >= 32 && given && sameSecret(given, expected)) return sandboxTestUserID;
  }
  const header = req.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  const response = await fetch(`${supabaseURL}/auth/v1/user`, {
    headers: { apikey: serviceKey2, Authorization: `Bearer ${token}` }
  });
  if (!response.ok) throw new HttpError(401, "unauthorized", "Session expired. Sign in again.");
  const user = await response.json();
  if (!user.id) throw new HttpError(401, "unauthorized", "Sign in required.");
  return user.id;
}
async function requireUser(req) {
  const userId = await sessionUserID(req);
  if (!userId) throw new HttpError(401, "unauthorized", "Sign in required.");
  return userId;
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

// fn/_shared/linkgrant.ts
var FALLBACK_TTL_MS = 4 * 60 * 60 * 1e3;
async function requireLinkGrant(userId, linkToken) {
  const hash = await sha256Hex(linkToken);
  const rows = await (await rest(
    `plaid_link_grants?select=user_id,expires_at&token_hash=eq.${encodeURIComponent(hash)}`
  )).json();
  const row = rows[0];
  if (!row || row.user_id !== userId || new Date(row.expires_at).getTime() <= Date.now()) {
    throw new HttpError(404, "not_found", "That Link session wasn't found.");
  }
}

// fn/_shared/linksessionlog.ts
function linkSessionLogLine(session, requestId) {
  const id = session.link_session_id ?? "none";
  const errorType = session.exit_error?.error_type ?? "none";
  const errorCode = session.exit_error?.error_code ?? "none";
  const error = session.exit_error ? `${errorType}/${errorCode}` : "none";
  const names = session.events.map((event) => event.event_name).filter(Boolean).join(",") || "none";
  const eventErrors = session.event_errors.map((event) => `${event.event}:${event.error_type ?? "none"}/${event.error_code}`).join(",") || "none";
  const mfa = session.events.map((event) => event.mfa_type).filter(Boolean).join(",") || "none";
  return `Link session ${id}: link_session_id=${id} request_id=${requestId ?? "none"} succeeded=${session.succeeded} status=${session.exit_status} exit_error=${error} error_type=${errorType} error_code=${errorCode} institution=${session.institution?.id ?? "none"} events=${names} event_errors=${eventErrors} mfa=${mfa}`;
}
function linkSessionFingerprint(session) {
  return `${linkSessionLogLine(session)} finished=${session.finished_at ?? "null"}`;
}
function tokenLogKey(linkToken, sessionId) {
  let hash = 2166136261;
  for (let i = 0; i < linkToken.length; i++) {
    hash ^= linkToken.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${hash >>> 0}:${sessionId ?? "none"}`;
}
var LinkSessionLogGate = class {
  constructor(limit = 200) {
    this.limit = limit;
  }
  seen = /* @__PURE__ */ new Map();
  remember(key, fingerprint) {
    if (this.seen.get(key) === fingerprint) return false;
    if (!this.seen.has(key) && this.seen.size >= this.limit) {
      const oldest = this.seen.keys().next().value;
      if (oldest !== void 0) this.seen.delete(oldest);
    }
    this.seen.delete(key);
    this.seen.set(key, fingerprint);
    return true;
  }
};

// fn/_shared/linktoken.ts
var SERVICER_NAMES = [
  "shellpoint",
  "newrez",
  "bsi financial",
  "bsi",
  "servbank",
  "mr. cooper",
  "mr cooper",
  "nationstar",
  "rocket mortgage",
  "pennymac",
  "freedom mortgage",
  "loandepot",
  "loan depot",
  "cenlar",
  "carrington",
  "lakeview loan",
  "select portfolio",
  "sps servicing",
  "dovenmuehle",
  "flagstar",
  "roundpoint",
  "loancare",
  "loan care",
  "midfirst",
  "planet home",
  "home point",
  "guild mortgage",
  "midland mortgage",
  "phh",
  "specialized loan",
  "sallie mae",
  "nelnet",
  "mohela",
  "aidvantage",
  "navient",
  "edfinancial",
  "ally auto",
  "santander consumer",
  "carvana"
];
var SERVICER_WORDS = ["mortgage", "servicing", "home loan", "home lending", "student loan", "auto loan", "lending"];
function looksLikeServicer(query) {
  if (typeof query !== "string") return false;
  const text = query.trim().toLowerCase();
  if (text.length < 3) return false;
  const tokens = new Set(text.split(/[^a-z0-9]+/).filter(Boolean));
  return SERVICER_NAMES.some((name) => name.length <= 3 ? tokens.has(name) : text.includes(name)) || SERVICER_WORDS.some((word) => text.includes(word));
}

// fn/_shared/plaid.ts
var environments = {
  sandbox: "https://sandbox.plaid.com",
  production: "https://production.plaid.com"
};
function plaidConfig() {
  if (mode.sandbox) {
    return { baseURL: environments.sandbox, secret: Deno.env.get("PLAID_SANDBOX_SECRET") };
  }
  const env = Deno.env.get("PLAID_ENV") ?? "sandbox";
  const baseURL = environments[env];
  if (!baseURL) throw new Error(`Unknown PLAID_ENV "${env}"`);
  return { baseURL, secret: Deno.env.get("PLAID_SECRET") };
}
var PlaidError = class extends Error {
  constructor(code, type, status, plaidMessage, displayMessage, requestId) {
    super(code);
    this.code = code;
    this.type = type;
    this.status = status;
    this.plaidMessage = plaidMessage;
    this.displayMessage = displayMessage;
    this.requestId = requestId;
  }
};
async function plaid(path, body) {
  const { baseURL, secret } = plaidConfig();
  if (!secret) throw new HttpError(500, "server_misconfigured", "The server's Plaid keys are missing.");
  const response = await fetch(`${baseURL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: Deno.env.get("PLAID_CLIENT_ID"),
      secret,
      ...body
    })
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new PlaidError(
      data.error_code ?? "UNKNOWN",
      data.error_type ?? "UNKNOWN",
      response.status,
      data.error_message ?? "",
      data.display_message ?? null,
      data.request_id ?? null
    );
    const linkSession = typeof data.link_session_id === "string" ? data.link_session_id : "none";
    console.error(`Plaid ${path} failed: ${error.type}/${error.code} request_id=${error.requestId ?? "none"} link_session_id=${linkSession}`);
    throw error;
  }
  return data;
}
function toHttpError(error) {
  if (!(error instanceof PlaidError)) return error;
  switch (error.code) {
    case "ITEM_LOGIN_REQUIRED":
    case "PENDING_EXPIRATION":
    case "PENDING_DISCONNECT":
      return new HttpError(409, "item_login_required", "This bank needs you to sign in again.");
    case "ITEM_NOT_FOUND":
      return new HttpError(404, "item_not_found", "That bank connection no longer exists.");
    case "INVALID_ACCESS_TOKEN":
      return new HttpError(404, "item_not_found", "This bank connection is no longer valid. Disconnect it and connect again.");
    case "INVALID_PUBLIC_TOKEN":
      return new HttpError(400, "invalid_public_token", "The bank connection expired. Try connecting again.");
    case "INVALID_API_KEYS":
      return new HttpError(500, "server_misconfigured", "The server's Plaid keys are invalid.");
    default:
      return new HttpError(
        502,
        "plaid_error",
        `${error.displayMessage ?? error.plaidMessage} (Plaid ${error.code}${error.requestId ? `, request ${error.requestId}` : ""})`
      );
  }
}

// fn/plaid-link-session/index.ts
var sessionLogs = new LinkSessionLogGate();
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
async function storeTokenGetEvents(rawSessions) {
  const rows = [];
  const seen = new Set();
  for (const session of rawSessions) {
    const sessionId = typeof session.link_session_id === "string" ? session.link_session_id : null;
    for (const event of session.events ?? []) {
      if (!event || typeof event !== "object") continue;
      const redacted = redactTokens(event);
      const given = typeof event.event_id === "string" ? event.event_id : "";
      const eventId = given || await sha256Hex(JSON.stringify(redacted));
      if (seen.has(eventId)) continue;
      seen.add(eventId);
      rows.push({
        source: "token_get",
        link_session_id: sessionId,
        event_id: eventId,
        event_name: typeof event.event_name === "string" ? event.event_name : null,
        webhook_code: null,
        payload: redacted
      });
    }
  }
  if (!rows.length) return;
  await rest("plaid_link_session_events?on_conflict=source,event_id", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify(rows)
  });
}
function errorOf(value) {
  if (!value || !value.error_code) return null;
  return { error_code: value.error_code, error_type: value.error_type ?? null };
}
Deno.serve(handle(async (req, body) => {
  const userId = await requireUser(req);
  const linkToken = requireString(body, "link_token");
  if (!linkToken.startsWith("link-")) return json({ error: "invalid_request", message: "Not a link token." }, 400);
  await requireLinkGrant(userId, linkToken);
  let result;
  try {
    result = await plaid("/link/token/get", { link_token: linkToken });
  } catch (error) {
    throw toHttpError(error);
  }
  const sessions = (result.link_sessions ?? []).map((session) => {
    const exit = session.exit ?? session.on_exit ?? null;
    const itemAdds = session.results?.item_add_results ?? [];
    const institution = exit?.metadata?.institution ?? session.on_success?.metadata?.institution ?? itemAdds[0]?.institution ?? null;
    const eventErrors = (session.events ?? []).map((event) => ({ event: event.event_name, ...errorOf(event.event_metadata) })).filter((event) => event.error_code);
    const events = (session.events ?? []).map((event) => {
      const meta = event.event_metadata ?? {};
      const pick = (key) => typeof meta[key] === "string" && meta[key] !== "" ? meta[key] : null;
      return {
        event_name: event.event_name ?? "UNKNOWN",
        timestamp: event.timestamp ?? null,
        mfa_type: pick("mfa_type"),
        error_code: pick("error_code"),
        error_type: pick("error_type"),
        error_message: pick("error_message")?.slice(0, 200) ?? null,
        exit_status: pick("exit_status"),
        view_name: pick("view_name"),
        institution_id: pick("institution_id"),
        institution_name: pick("institution_name"),
        request_id: pick("request_id")
      };
    });
    return {
      events,
      link_session_id: session.link_session_id ?? null,
      started_at: session.started_at ?? null,
      finished_at: session.finished_at ?? null,
      succeeded: Boolean(session.on_success ?? itemAdds.length),
      public_tokens: itemAdds.map((result2) => result2.public_token).filter((token) => typeof token === "string"),
      exit_status: exit?.metadata?.status ?? null,
      exit_error: errorOf(exit?.error),
      institution: institution ? { id: institution.institution_id ?? null, name: institution.name ?? null } : null,
      event_errors: eventErrors,
      // The last search that looks like a mortgage or loan servicer, for "Can't find your servicer?". Any other
      // search text is dropped; this one is returned only, never logged or stored.
      servicer_search: (session.events ?? []).map((event) => event.event_metadata?.institution_search_query).filter(looksLikeServicer).pop()?.trim().slice(0, 80) ?? null
    };
  });
  try {
    await storeTokenGetEvents(result.link_sessions ?? []);
  } catch {
    console.error("plaid-link-session: couldn't store link events");
  }
  for (const s of sessions) {
    const line = linkSessionLogLine(s, result.request_id);
    if (sessionLogs.remember(tokenLogKey(linkToken, s.link_session_id), linkSessionFingerprint(s))) console.log(line);
  }
  if (mode.sandbox) {
    for (const session of result.link_sessions ?? []) {
      const client = ["client_type", "client", "platform", "sdk_version", "link_open_type"].map((key) => session[key] !== void 0 ? `${key}=${JSON.stringify(session[key])}` : null).filter(Boolean).join(" ");
      console.log(
        `Link session ${session.link_session_id ?? "none"} link_session_id=${session.link_session_id ?? "none"} fields=${Object.keys(session).sort().join(",")} ${client || "client=none"}`
      );
    }
  }
  if (sessions.length === 0 && sessionLogs.remember(tokenLogKey(linkToken, "empty"), "no-session")) {
    console.log(
      `Link token has no session data link_session_id=none request_id=${result.request_id ?? "none"} error_code=NO_SESSION`
    );
  }
  return json({ sessions });
}, { cors: "app" }));
