var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};

// fn/_shared/monitor.ts
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
  const base = Deno.env.get("SUPABASE_URL"), key2 = serviceKey();
  if (!base || !key2) return null;
  return await fetch(`${base}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key2, Authorization: `Bearer ${key2}`, "Content-Type": "application/json", ...init.headers ?? {} }
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
var ALERT_THRESHOLD, ALERT_WINDOW_MINUTES, ALERT_COOLDOWN_MINUTES;
var init_monitor = __esm({
  "fn/_shared/monitor.ts"() {
    ALERT_THRESHOLD = 10;
    ALERT_WINDOW_MINUTES = 15;
    ALERT_COOLDOWN_MINUTES = 60;
  }
});

// fn/_shared/http.ts
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
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
function requireString(body, key2) {
  const value = body[key2];
  if (typeof value !== "string" || value.length === 0 || value.length > 512) {
    throw new HttpError(400, "invalid_request", `Missing or invalid "${key2}".`);
  }
  return value;
}
function optionalString(body, key2) {
  const value = body[key2];
  if (value === void 0 || value === null || value === "") return void 0;
  return requireString(body, key2);
}
var HttpError, corsHeaders, APP_ORIGINS;
var init_http = __esm({
  "fn/_shared/http.ts"() {
    init_monitor();
    HttpError = class extends Error {
      constructor(status, code, message, retryAfterSeconds) {
        super(message);
        this.status = status;
        this.code = code;
        this.retryAfterSeconds = retryAfterSeconds;
      }
    };
    corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info, x-davey-install-token"
    };
    APP_ORIGINS = ["https://daveypersonalfinance.com", "https://www.daveypersonalfinance.com"];
  }
});

// fn/_shared/mode.ts
var mode;
var init_mode = __esm({
  "fn/_shared/mode.ts"() {
    mode = { sandbox: false };
  }
});

// fn/_shared/supabase.ts
function serviceHeaders() {
  return serviceKey2.startsWith("sb_") ? { apikey: serviceKey2 } : { apikey: serviceKey2, Authorization: `Bearer ${serviceKey2}` };
}
function mustGetEnv(name) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}
function itemsTable() {
  return mode.sandbox ? "plaid_items_sandbox" : "plaid_items";
}
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
async function householdUserIDs(userId) {
  if (!uuidPattern.test(userId)) return [userId];
  const rows = await (await rest(
    `household_members?select=household_id&user_id=eq.${encodeURIComponent(userId)}`
  )).json();
  if (rows.length === 0) return [userId];
  const members = await (await rest(
    `household_members?select=user_id&household_id=eq.${rows[0].household_id}`
  )).json();
  return members.length ? members.map((m) => m.user_id) : [userId];
}
function userFilter(ids) {
  return ids.length === 1 ? `user_id=eq.${encodeURIComponent(ids[0])}` : `user_id=in.(${ids.map(encodeURIComponent).join(",")})`;
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
async function getItem(userId, itemId) {
  const ids = await householdUserIDs(userId);
  const query = `${itemsTable()}?select=*&${userFilter(ids)}&item_id=eq.${encodeURIComponent(itemId)}`;
  const rows = await (await rest(query)).json();
  if (rows.length === 0) throw new HttpError(404, "item_not_found", "That bank connection wasn't found.");
  return rows[0];
}
async function listItems(userId) {
  const ids = await householdUserIDs(userId);
  return await (await rest(`${itemsTable()}?select=*&${userFilter(ids)}`)).json();
}
var supabaseURL, serviceKey2, sandboxTestUserID, uuidPattern;
var init_supabase = __esm({
  "fn/_shared/supabase.ts"() {
    init_http();
    init_mode();
    supabaseURL = mustGetEnv("SUPABASE_URL");
    serviceKey2 = (() => {
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
    sandboxTestUserID = "sandbox-e2e-test";
    uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  }
});

// fn/_shared/appstore.ts
import * as x509 from "npm:@peculiar/x509@1.12.3";
function base64Decode(value) {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
var APPLE_ROOT_CA_G3, appleRootCertificate;
var init_appstore = __esm({
  "fn/_shared/appstore.ts"() {
    x509.cryptoProvider.set(crypto);
    APPLE_ROOT_CA_G3 = "MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwSQXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcNMTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBSb290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtfTjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySrMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gAMGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM6BgD56KyKA==";
    appleRootCertificate = new x509.X509Certificate(base64Decode(APPLE_ROOT_CA_G3));
  }
});

// fn/_shared/entitlement.ts
function parseBankLimit(value) {
  const raw = value && typeof value === "object" ? value.value ?? value.limit : value;
  const n = typeof raw === "string" ? Number(raw) : raw;
  return typeof n === "number" && Number.isInteger(n) && n >= 1 ? n : DEFAULT_MAX_BANK_CONNECTIONS;
}
async function maxBankConnections() {
  if (cachedBankLimit && Date.now() - cachedBankLimit.at < 6e4) return cachedBankLimit.value;
  let value = DEFAULT_MAX_BANK_CONNECTIONS;
  try {
    const rows = await (await rest(`server_flags?select=value&key=eq.${BANK_LIMIT_FLAG}`)).json();
    if (rows.length) value = parseBankLimit(rows[0].value);
  } catch {
  }
  cachedBankLimit = { value, at: Date.now() };
  return value;
}
function checkBankLimit(count2, limit, premium, premiumLimit = limit) {
  if (count2 < limit) return { allowed: true };
  return {
    allowed: false,
    message: premium ? `You've connected ${limit} banks, Davey Premium's fair-use limit. Disconnect one you no longer use, or contact support and we'll help.` : `The free plan includes ${limit} bank connection. Davey Premium connects up to ${premiumLimit}, and manual accounts are always unlimited.`
  };
}
function isActive(row, now = /* @__PURE__ */ new Date()) {
  if (row.revoked_at) return false;
  return row.expires_at !== null && new Date(row.expires_at) > now;
}
function inheritsPremium(ownerRows, now = /* @__PURE__ */ new Date()) {
  if (ownerRows.some((row) => isActive(row, now))) return true;
  const ends = ownerRows.map((row) => row.revoked_at ?? row.expires_at).filter((d) => !!d).map((d) => new Date(d).getTime());
  return ends.length > 0 && Math.max(...ends) + GRACE_DAYS * 864e5 > now.getTime();
}
async function entitlementRowsFor(userId) {
  const response = await rest(
    `subscription_entitlements?select=expires_at,revoked_at&user_id=eq.${encodeURIComponent(userId)}`
  );
  return await response.json();
}
async function isPremium(userId, now = /* @__PURE__ */ new Date()) {
  if (!PAYWALL_ENABLED) return true;
  if (!isUUID(userId)) return false;
  if ((await entitlementRowsFor(userId)).some((row) => isActive(row, now))) return true;
  const membership = await (await rest(
    `household_members?select=role,households(owner_id)&user_id=eq.${encodeURIComponent(userId)}`
  )).json();
  const ownerId = membership[0]?.role === "member" ? membership[0].households?.owner_id : void 0;
  return ownerId ? inheritsPremium(await entitlementRowsFor(ownerId), now) : false;
}
async function limitsFor(userId) {
  const premiumBanks = await maxBankConnections();
  return await isPremium(userId) ? { premium: true, ...LIMITS.premium, bankConnections: premiumBanks, premiumBankConnections: premiumBanks } : { premium: false, ...LIMITS.free, premiumBankConnections: premiumBanks };
}
function isUUID(value) {
  return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
function planLimitError(message) {
  return new HttpError(402, "plan_limit", message);
}
var PAYWALL_ENABLED, LIMITS, BANK_LIMIT_FLAG, DEFAULT_MAX_BANK_CONNECTIONS, cachedBankLimit, GRACE_DAYS;
var init_entitlement = __esm({
  "fn/_shared/entitlement.ts"() {
    init_http();
    init_appstore();
    init_supabase();
    PAYWALL_ENABLED = false;
    LIMITS = {
      free: { bankConnections: 1, askAIPerMonth: 5 },
      premium: { askAIPerMonth: 100 }
    };
    BANK_LIMIT_FLAG = "max_bank_connections";
    DEFAULT_MAX_BANK_CONNECTIONS = 30;
    cachedBankLimit = null;
    GRACE_DAYS = 7;
  }
});

// fn/plaid-link-token/index.ts
init_http();

// fn/_shared/plaid.ts
init_http();
init_mode();
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
function webhookURL() {
  const base = Deno.env.get("SUPABASE_URL");
  return base ? `${base}/functions/v1/plaid-webhook${mode.sandbox ? "-sandbox" : ""}` : void 0;
}

// fn/_shared/crypto.ts
var VERSION = "v1";
function decodeBase64(value) {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
async function importKey(base64Key) {
  const raw = decodeBase64(base64Key);
  if (raw.length !== 32) throw new Error("PLAID_TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  return await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
var cachedKey;
function key() {
  if (!cachedKey) {
    const value = Deno.env.get("PLAID_TOKEN_ENCRYPTION_KEY");
    if (!value) throw new Error("Missing PLAID_TOKEN_ENCRYPTION_KEY");
    cachedKey = importKey(value);
  }
  return cachedKey;
}
async function decrypt(value, cryptoKey) {
  const [version, payload] = value.split(":", 2);
  if (version !== VERSION || !payload) throw new Error("Unrecognized ciphertext format");
  const combined = decodeBase64(payload);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: combined.slice(0, 12) },
    cryptoKey ?? await key(),
    combined.slice(12)
  );
  return new TextDecoder().decode(plaintext);
}

// fn/_shared/liabilities.ts
init_mode();
init_supabase();
var FLAG_KEY = "liabilities_disabled";
var STALE_MS = 24 * 3600 * 1e3;
var disabledCache = null;
async function liabilitiesEnabled() {
  if (Deno.env.get("PLAID_LIABILITIES") === "false") return false;
  if (disabledCache && Date.now() - disabledCache.at < 6e5) return !disabledCache.value;
  try {
    const rows = await (await rest(`server_flags?select=value&key=eq.${FLAG_KEY}${mode.sandbox ? "_sandbox" : ""}`)).json();
    disabledCache = { value: rows[0]?.value?.disabled === true, at: Date.now() };
  } catch {
    disabledCache = { value: false, at: Date.now() };
  }
  return !disabledCache.value;
}
async function disableLiabilities(reason) {
  disabledCache = { value: true, at: Date.now() };
  console.error(`ALERT: Plaid Liabilities disabled automatically (${reason}). Enable it in the Plaid Dashboard, then delete server_flags row ${FLAG_KEY}.`);
  try {
    await rest("server_flags?on_conflict=key", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ key: `${FLAG_KEY}${mode.sandbox ? "_sandbox" : ""}`, value: { disabled: true, reason, at: (/* @__PURE__ */ new Date()).toISOString() } })
    });
  } catch {
  }
}
function isProductNotEnabled(error) {
  return error instanceof PlaidError && ["PRODUCT_NOT_ENABLED", "INVALID_PRODUCT", "PRODUCTS_NOT_ENABLED"].includes(error.code);
}

// fn/plaid-link-token/index.ts
init_supabase();

// fn/_shared/accesspin.ts
async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// fn/_shared/linkgrant.ts
init_http();
init_supabase();
var FALLBACK_TTL_MS = 4 * 60 * 60 * 1e3;
async function recordLinkGrant(userId, linkToken, expiration) {
  if (!linkToken.startsWith("link-")) return;
  const hash = await sha256Hex(linkToken);
  let expires = new Date(Date.now() + FALLBACK_TTL_MS);
  if (expiration) {
    const parsed = new Date(expiration);
    if (!Number.isNaN(parsed.getTime())) expires = parsed;
  }
  await rest("plaid_link_grants?on_conflict=token_hash", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ token_hash: hash, user_id: userId, expires_at: expires.toISOString() })
  });
  const cutoff = encodeURIComponent((/* @__PURE__ */ new Date()).toISOString());
  try {
    await rest(`plaid_link_grants?expires_at=lt.${cutoff}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" }
    });
  } catch {
  }
}

// fn/_shared/linktoken.ts
var CHASE_INSTITUTION_ID = "ins_56";
function investmentsConsentAllowed(institutionId) {
  if (!institutionId) return "unknown";
  if (institutionId === CHASE_INSTITUTION_ID) return "chase";
  return "ok";
}
var LOAN_SUBTYPES = ["mortgage", "home equity", "line of credit", "student", "auto", "consumer", "loan", "other"];
function linkProducts(mode2, liabilitiesEnabled2, investmentsEnabled = true, fallback = false, options = {}) {
  if (mode2 === "account") {
    return { products: ["transactions"], transactions: { days_requested: 730 } };
  }
  if (fallback) {
    const simple = { products: ["transactions"], transactions: { days_requested: 730 } };
    if (liabilitiesEnabled2 && mode2 === "loans") simple.optional_products = ["liabilities"];
    return simple;
  }
  const brokerageWithInvestments = mode2 === "brokerage" && investmentsEnabled;
  const products = {
    products: brokerageWithInvestments ? ["investments"] : ["transactions"],
    transactions: { days_requested: 730 }
  };
  if (brokerageWithInvestments) products.optional_products = ["transactions"];
  else if (liabilitiesEnabled2 && mode2 === "loans") products.optional_products = ["liabilities"];
  if (mode2 === "loans") return products;
  if (mode2 === "brokerage") {
    products.account_filters = {
      investment: { account_subtypes: ["all"] },
      depository: { account_subtypes: ["all"] }
    };
    return products;
  }
  products.account_filters = {
    depository: { account_subtypes: ["all"] },
    credit: { account_subtypes: ["all"] },
    investment: { account_subtypes: ["all"] },
    loan: { account_subtypes: LOAN_SUBTYPES }
  };
  return products;
}
function parsePlatform(value) {
  return value === "ios" || value === "mac" || value === "web" ? value : void 0;
}
var IOS_REDIRECT_URI = "https://herringtondavid11-dotcom.github.io/plaid/oauth";
var WEB_REDIRECT_URI = "https://daveypersonalfinance.com/app/oauth";
function unregisteredRedirect(value) {
  if (!value) return false;
  return value !== IOS_REDIRECT_URI && value !== WEB_REDIRECT_URI;
}
function redirectCandidates(platform) {
  if (platform === "mac") return [];
  return [platform === "web" ? WEB_REDIRECT_URI : IOS_REDIRECT_URI];
}
function oauthRequestError(request, platform, hosted, mode2, update) {
  if ("android_package_name" in request) return "android_package_name is not used on iOS, Mac, or web";
  if (request.required_if_supported_products != null) return "required_if_supported_products fails Chase and servicers when the product errors";
  if (!update && mode2 === "bank") {
    const products = request.products;
    if (!Array.isArray(products) || products.length !== 1 || products[0] !== "transactions") {
      return "Connect a Bank may only require transactions";
    }
    if (request.optional_products != null) return "Connect a Bank must not initialize optional products during Link";
    if (request.additional_consented_products != null) return "Connect a Bank must not request extra product consent";
  }
  if (!update && mode2 === "account") {
    const products = request.products;
    if (!Array.isArray(products) || products.length !== 1 || products[0] !== "transactions") {
      return "Connect an account may only require transactions";
    }
    if (request.additional_consented_products != null) return "Connect an account must not request extra product consent";
    if (request.optional_products != null) return "Connect an account must not initialize optional products during Link";
  }
  const redirect = request.redirect_uri;
  if (hosted || platform === "mac") {
    return redirect == null ? null : "Hosted Link must not set redirect_uri";
  }
  const expected = platform === "web" ? WEB_REDIRECT_URI : IOS_REDIRECT_URI;
  if (redirect !== expected) return "redirect_uri is not an allowed Dashboard URI";
  return null;
}
var SHELLPOINT_INSTITUTION_ID = "ins_119891";
function wantsFallback(fallback, institutionId) {
  return fallback === true || fallback === "true" || institutionId === SHELLPOINT_INSTITUTION_ID;
}
function parseMode(value) {
  return value === "loans" || value === "brokerage" || value === "account" ? value : "bank";
}

// fn/plaid-link-token/index.ts
init_entitlement();
Deno.serve(handle(async (req, body) => {
  const userId = await requireUser(req);
  const itemId = optionalString(body, "item_id");
  const platform = parsePlatform(body.platform);
  const hosted = platform === "mac" || platform === void 0 && optionalString(body, "hosted") === "desktop";
  if ((platform === "ios" || platform === "web") && body.hosted !== void 0) {
    throw new HttpError(400, "invalid_request", "Hosted Link is only used by the Mac app.");
  }
  const mode2 = parseMode(body.mode);
  const institutionId = optionalString(body, "institution_id");
  const fallback = wantsFallback(body.fallback, institutionId);
  const request = {
    client_name: "Davey",
    language: "en",
    country_codes: ["US"],
    user: { client_user_id: userId }
  };
  const webhook = webhookURL();
  if (webhook) request.webhook = webhook;
  for (const secret of ["PLAID_REDIRECT_URI", "PLAID_REDIRECT_URI_APP", "PLAID_REDIRECT_URI_WEB"]) {
    if (unregisteredRedirect(Deno.env.get(secret))) {
      console.error(`ALERT: plaid-link-token: ${secret} is not an allowed Dashboard redirect URI; ignored`);
    }
  }
  const redirects = redirectCandidates(hosted ? "mac" : platform);
  if (redirects.length) request.redirect_uri = redirects[0];
  const clientRedirect = optionalString(body, "redirect_uri");
  if (clientRedirect && clientRedirect !== request.redirect_uri) {
    console.error("ALERT: plaid-link-token: client redirect_uri ignored (not the Dashboard URI for this platform)");
  }
  if (hosted) {
    request.hosted_link = {
      completion_redirect_uri: Deno.env.get("HOSTED_LINK_COMPLETION_URI") || "davey://plaid/hosted-link-complete",
      url_lifetime_seconds: 1800,
      is_mobile_app: false
    };
  }
  if (itemId) {
    const item = await getItem(userId, itemId);
    request.access_token = await decrypt(item.access_token_ciphertext);
    if (body.extend_history === true || body.extend_history === "true") request.transactions = { days_requested: 730 };
    if (body.consent === "investments" || body.consent === "liabilities") {
      const limits = await limitsFor(userId);
      if (!limits.premium) {
        throw planLimitError("Davey Premium adds investment holdings and loan details to a connected account. Transactions are included on every plan.");
      }
    }
    if (body.consent === "investments" || body.consent === "liabilities") {
      const institution = await itemInstitutionID(request.access_token);
      const decision = investmentsConsentAllowed(institution);
      if (decision !== "ok") {
        console.error(`plaid-link-token: refusing ${body.consent} consent (${decision})`);
        throw new HttpError(
          400,
          decision === "chase" ? "chase_consent_refused" : "consent_refused",
          decision === "chase" ? "Chase connections stay on transactions, so signing in there keeps working. Add a Chase investment or mortgage as a manual account if you want it tracked that way." : "Couldn't confirm which institution this is, so that product wasn't added. Try again in a moment."
        );
      }
    }
    if (body.consent === "investments") {
      request.additional_consented_products = ["investments"];
    } else if (body.consent === "liabilities" && await liabilitiesEnabled()) {
      request.additional_consented_products = ["liabilities"];
    }
  } else {
    const [items, limits] = await Promise.all([listItems(userId), limitsFor(userId)]);
    const check = checkBankLimit(items.length, limits.bankConnections, limits.premium, limits.premiumBankConnections);
    if (!check.allowed) throw planLimitError(check.message);
    Object.assign(request, linkProducts(mode2, await liabilitiesEnabled(), true, fallback, {
      planAllowsExtras: limits.premium,
      institutionId
    }));
  }
  const preselect = Boolean(institutionId && /^ins_[A-Za-z0-9_]+$/.test(institutionId) && !itemId);
  const create = async (preselecting) => {
    for (; ; ) {
      const problem = oauthRequestError(request, platform, hosted, mode2, Boolean(itemId));
      if (problem) {
        console.error(`ALERT: plaid-link-token: refusing token (${problem})`);
        throw new HttpError(500, "server_misconfigured", "Bank connection isn't configured correctly. Try again later.");
      }
      try {
        return await plaid("/link/token/create", preselecting ? { ...request, institution_id: institutionId } : request);
      } catch (error) {
        if (!(error instanceof PlaidError)) throw error;
        const asked = JSON.stringify([request.products, request.optional_products, request.required_if_supported_products, request.additional_consented_products]);
        if (isProductNotEnabled(error) && asked.includes("liabilities") && !itemId) {
          await disableLiabilities(error.code);
          delete request.optional_products;
          delete request.required_if_supported_products;
          delete request.additional_consented_products;
          Object.assign(request, linkProducts(mode2, false, true, fallback, {
            planAllowsExtras: false,
            institutionId
          }));
        } else if (isProductNotEnabled(error) && asked.includes("investments") && !itemId) {
          console.error(`ALERT: plaid-link-token: Investments not enabled (${error.code} request_id=${error.requestId ?? "none"}); brokerage token uses transactions`);
          delete request.optional_products;
          delete request.required_if_supported_products;
          delete request.additional_consented_products;
          Object.assign(request, linkProducts(mode2, false, false, fallback, {
            planAllowsExtras: false,
            institutionId
          }));
        } else {
          throw error;
        }
      }
    }
  };
  try {
    let result;
    let preselected = false;
    try {
      result = await create(preselect);
      preselected = preselect;
    } catch (error) {
      if (!preselect || !(error instanceof PlaidError) || !["INVALID_REQUEST", "INVALID_INPUT"].includes(error.type)) throw error;
      console.log(`plaid-link-token: institution preselect not accepted (${error.type}/${error.code} request_id=${error.requestId ?? "none"}); opening Link without it`);
      result = await create(false);
    }
    console.log(
      `plaid-link-token: platform=${platform ?? "legacy"} hosted=${hosted} mode=${itemId ? "update" : mode2} config=${fallback && !itemId ? "fallback" : "standard"} products=${JSON.stringify(request.products ?? [])} optional=${JSON.stringify(request.optional_products ?? [])} additional=${JSON.stringify(request.additional_consented_products ?? [])} required_if_supported=${JSON.stringify(request.required_if_supported_products ?? [])} redirect_uri=${typeof request.redirect_uri === "string" ? request.redirect_uri : "none"} request_id=${result.request_id ?? "none"}`
    );
    await recordLinkGrant(userId, result.link_token, result.expiration);
    return json({
      link_token: result.link_token,
      expiration: result.expiration,
      hosted_link_url: result.hosted_link_url ?? null,
      preselected,
      config: fallback && !itemId ? "fallback" : "standard",
      // Davey on the web reconnects only when the server confirms update mode (otherwise it would add a duplicate).
      ...itemId ? { mode: "update" } : {}
    });
  } catch (error) {
    throw toHttpError(error);
  }
}, { cors: "app" }));
async function itemInstitutionID(accessToken) {
  try {
    const item = await plaid("/item/get", { access_token: accessToken });
    return item.item.institution_id ?? null;
  } catch {
    return null;
  }
}
