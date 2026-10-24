// _shared/http.ts
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

// _shared/mode.ts
var mode = { sandbox: false };

// _shared/plaid.ts
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
  code;
  type;
  status;
  plaidMessage;
  displayMessage;
  requestId;
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
    console.error(`Plaid ${path} failed: ${error.type}/${error.code} request_id=${error.requestId}`);
    throw error;
  }
  return data;
}

// _shared/webhook.ts
var WebhookVerificationError = class extends Error {
};
var keyCache = /* @__PURE__ */ new Map();
var fetchPlaidKey = async (keyID) => {
  const cached = keyCache.get(keyID);
  if (cached) return cached;
  const result = await plaid("/webhook_verification_key/get", { key_id: keyID });
  keyCache.set(keyID, result.key);
  return result.key;
};
function base64UrlDecode(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64 + "=".repeat((4 - base64.length % 4) % 4)), (c) => c.charCodeAt(0));
}
async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function verifyPlaidWebhook(rawBody, verificationHeader, fetchKey = fetchPlaidKey, now = Date.now()) {
  if (!verificationHeader) throw new WebhookVerificationError("missing Plaid-Verification");
  const parts = verificationHeader.split(".");
  if (parts.length !== 3) throw new WebhookVerificationError("malformed JWT");
  let header;
  let claims;
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])));
    claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));
  } catch {
    throw new WebhookVerificationError("malformed JWT");
  }
  if (header.alg !== "ES256" || !header.kid) throw new WebhookVerificationError("unexpected algorithm");
  const jwk = await fetchKey(header.kid);
  if (jwk.expired_at) throw new WebhookVerificationError("expired key");
  const key2 = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"]
  );
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key2,
    base64UrlDecode(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  );
  if (!valid) throw new WebhookVerificationError("bad signature");
  if (typeof claims.iat !== "number" || now / 1e3 - claims.iat > 5 * 60) throw new WebhookVerificationError("too old");
  if (claims.request_body_sha256 !== await sha256Hex(rawBody)) throw new WebhookVerificationError("body mismatch");
}
function itemStateFor(webhook) {
  const type = webhook.webhook_type, code = webhook.webhook_code;
  if (type === "TRANSACTIONS" && code === "SYNC_UPDATES_AVAILABLE") return { needs_sync: true };
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

// _shared/supabase.ts
var supabaseURL = mustGetEnv("SUPABASE_URL");
var serviceKey = (() => {
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
  return serviceKey.startsWith("sb_") ? { apikey: serviceKey } : { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
}
function mustGetEnv(name) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}
function itemsTable() {
  return mode.sandbox ? "plaid_items_sandbox" : "plaid_items";
}
async function updateItemByPlaidID(itemId, fields) {
  const response = await rest(`${itemsTable()}?item_id=eq.${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...fields, updated_at: (/* @__PURE__ */ new Date()).toISOString() })
  });
  return (await response.json()).length > 0;
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

// _shared/investments.ts
var round2 = (n) => Math.round(n * 100) / 100;
function isoDay(d) {
  return d.toISOString().slice(0, 10);
}
function addDays(day, n) {
  const d = /* @__PURE__ */ new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDay(d);
}
var INVESTMENT_HISTORY_DAYS = 730;
function investmentHistoryStart(today) {
  return addDays(today, -INVESTMENT_HISTORY_DAYS);
}
function externalFlow(t) {
  const sub = (t.subtype ?? "").toLowerCase();
  const flowSubtypes = ["contribution", "deposit", "withdrawal", "transfer", "rollover", "distribution", "request"];
  if (t.type === "transfer" || t.type === "cash" && flowSubtypes.some((s) => sub.includes(s))) return -t.amount;
  return 0;
}
function reconstructHistory(input) {
  const securities = new Map(input.securities.map((s) => [s.security_id, s]));
  const isCash = (id) => {
    if (!id) return true;
    const s = securities.get(id);
    return Boolean(s?.is_cash_equivalent) || s?.type === "cash";
  };
  const qty = /* @__PURE__ */ new Map();
  const todayPrice = /* @__PURE__ */ new Map();
  let cash = 0;
  for (const h of input.holdings) {
    const price = h.institution_price ?? securities.get(h.security_id)?.close_price ?? 0;
    if (isCash(h.security_id)) {
      cash += h.institution_value ?? h.quantity * (price || 1);
    } else {
      qty.set(h.security_id, (qty.get(h.security_id) ?? 0) + h.quantity);
      todayPrice.set(h.security_id, price);
    }
  }
  const prices = /* @__PURE__ */ new Map();
  for (const t of input.transactions) {
    if (!t.security_id || !t.price || t.price <= 0 || isCash(t.security_id)) continue;
    const list = prices.get(t.security_id) ?? [];
    list.push({ date: t.date, price: t.price });
    prices.set(t.security_id, list);
  }
  for (const [id, price] of todayPrice) {
    if (!price) continue;
    const list = prices.get(id) ?? [];
    list.push({ date: input.today, price });
    prices.set(id, list);
  }
  for (const list of prices.values()) list.sort((a, b) => a.date.localeCompare(b.date));
  const dayNumber = (day) => Date.parse(`${day}T00:00:00Z`) / 864e5;
  const priceOn = (id, day) => {
    const list = prices.get(id);
    if (!list?.length) return todayPrice.get(id) ?? 0;
    if (day <= list[0].date) return list[0].price;
    for (let i = 1; i < list.length; i++) {
      if (day <= list[i].date) {
        const a = list[i - 1], b = list[i];
        const span = dayNumber(b.date) - dayNumber(a.date);
        return span > 0 ? a.price + (b.price - a.price) * (dayNumber(day) - dayNumber(a.date)) / span : b.price;
      }
    }
    return list[list.length - 1].price;
  };
  const byDay = /* @__PURE__ */ new Map();
  for (const t of input.transactions) {
    if (t.date > input.today || t.date < input.start) continue;
    const list = byDay.get(t.date) ?? [];
    list.push(t);
    byDay.set(t.date, list);
  }
  const out = [];
  for (let day = input.today; day >= input.start; day = addDays(day, -1)) {
    let value = cash;
    for (const [id, q] of qty) value += Math.max(0, q) * priceOn(id, day);
    const todays = byDay.get(day) ?? [];
    const flow = todays.reduce((sum, t) => sum + externalFlow(t), 0);
    out.push({ date: day, value: round2(Math.max(0, value)), net_flow: round2(flow) });
    for (const t of todays) {
      if (t.security_id && !isCash(t.security_id) && t.quantity) {
        qty.set(t.security_id, (qty.get(t.security_id) ?? 0) - t.quantity);
      }
      if (!(t.security_id && isCash(t.security_id) && t.type !== "cash" && t.type !== "fee" && t.type !== "transfer")) {
        cash += t.amount;
      }
    }
  }
  out.reverse();
  const lastEmpty = out.findLastIndex((d, i) => d.value <= 0 && i < out.length - 1);
  return lastEmpty >= 0 ? out.slice(lastEmpty + 1) : out;
}
function classifyInvestmentsError(error) {
  const code = error instanceof PlaidError ? error.code : "unknown";
  if (code === "ADDITIONAL_CONSENT_REQUIRED") return { status: "needs_consent", code };
  if (code === "PRODUCTS_NOT_SUPPORTED" || code === "NO_INVESTMENT_ACCOUNTS") {
    return { status: "not_supported", code };
  }
  return { status: "failed", code };
}
async function upsert(table2, conflict, rows) {
  for (let i = 0; i < rows.length; i += 500) {
    const response = await rest(`${table2}?on_conflict=${conflict}`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows.slice(i, i + 500))
    });
    if (!response.ok) throw new Error(`${table2} upsert failed: ${response.status}`);
  }
}
async function setItemStatus(itemsTable2, itemId, status, errorCode) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  await rest(`${itemsTable2}?item_id=eq.${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      investments_status: status,
      investments_error_code: errorCode,
      investments_error_at: errorCode ? now : null,
      ...status === "ok" ? { investments_synced_at: now } : {}
    })
  });
}
async function recordInvestmentsFailure(itemsTable2, itemId, code) {
  await rest(`${itemsTable2}?item_id=eq.${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ investments_error_code: code, investments_error_at: (/* @__PURE__ */ new Date()).toISOString() })
  });
}
async function syncInvestments(item, accessToken, itemsTable2, opts = {}) {
  try {
    return await pullInvestments(item, accessToken, itemsTable2, opts);
  } catch (error) {
    const classified = classifyInvestmentsError(error);
    if (classified.status === "failed") {
      await recordInvestmentsFailure(itemsTable2, item.item_id, classified.code);
      throw error;
    }
    await setItemStatus(itemsTable2, item.item_id, classified.status, classified.code);
    return { status: classified.status, accounts: 0, code: classified.code };
  }
}
async function pullInvestments(item, accessToken, itemsTable2, opts) {
  if (opts.refresh) {
    try {
      await plaid("/investments/refresh", { access_token: accessToken });
    } catch {
    }
  }
  const holdingsResult = await plaid(
    "/investments/holdings/get",
    { access_token: accessToken }
  );
  const { holdings, securities } = holdingsResult;
  const investmentAccountIds = (holdingsResult.accounts ?? []).filter((account) => account.type === "investment").map((account) => account.account_id);
  const accountIds = [.../* @__PURE__ */ new Set([...holdings.map((holding) => holding.account_id), ...investmentAccountIds])];
  if (accountIds.length === 0) {
    await setItemStatus(itemsTable2, item.item_id, "not_supported", "NO_INVESTMENT_ACCOUNTS");
    return { status: "not_supported", accounts: 0, code: "NO_INVESTMENT_ACCOUNTS" };
  }
  const today = isoDay(/* @__PURE__ */ new Date());
  const start = investmentHistoryStart(today);
  let transactions = [];
  if (opts.transactions !== false) {
    for (let offset = 0; offset < 2e4; ) {
      const page = await plaid(
        "/investments/transactions/get",
        { access_token: accessToken, start_date: start, end_date: today, options: { count: 500, offset } }
      );
      transactions.push(...page.investment_transactions);
      for (const s of page.securities) if (!securities.some((x) => x.security_id === s.security_id)) securities.push(s);
      offset += page.investment_transactions.length;
      if (!page.investment_transactions.length || offset >= page.total_investment_transactions) break;
    }
  }
  await upsert("investment_securities", "security_id", securities.map((s) => ({
    security_id: s.security_id,
    name: s.name ?? null,
    ticker: s.ticker_symbol ?? null,
    type: s.type ?? null,
    close_price: s.close_price ?? null,
    close_price_as_of: s.close_price_as_of ?? null,
    iso_currency_code: s.iso_currency_code ?? null,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  })));
  await rest(`investment_holdings?item_id=eq.${encodeURIComponent(item.item_id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  await upsert("investment_holdings", "item_id,account_id,security_id", holdings.map((h) => ({
    user_id: item.user_id,
    item_id: item.item_id,
    account_id: h.account_id,
    security_id: h.security_id,
    quantity: h.quantity,
    institution_price: h.institution_price ?? null,
    institution_value: h.institution_value ?? null,
    cost_basis: h.cost_basis ?? null,
    iso_currency_code: h.iso_currency_code ?? null,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  })));
  if (transactions.length) {
    await upsert("investment_transactions", "investment_transaction_id", transactions.map((t) => ({
      investment_transaction_id: t.investment_transaction_id,
      user_id: item.user_id,
      item_id: item.item_id,
      account_id: t.account_id,
      security_id: t.security_id ?? null,
      date: t.date,
      name: t.name ?? null,
      type: t.type,
      subtype: t.subtype ?? null,
      quantity: t.quantity ?? null,
      price: t.price ?? null,
      amount: t.amount,
      fees: t.fees ?? null,
      iso_currency_code: t.iso_currency_code ?? null
    })));
  }
  const real = /* @__PURE__ */ new Set();
  if (accountIds.length) {
    const rows = await (await rest(
      `investment_snapshots?select=account_id,date&estimated=eq.false&account_id=in.(${accountIds.map(encodeURIComponent).join(",")})`
    )).json();
    for (const r of rows) real.add(`${r.account_id}|${r.date}`);
  }
  const snapshots = [];
  for (const accountId of accountIds) {
    const history = reconstructHistory({
      holdings: holdings.filter((h) => h.account_id === accountId),
      securities,
      transactions: transactions.filter((t) => t.account_id === accountId),
      today,
      start
    });
    for (const day of history) {
      const isToday = day.date === today;
      if (!isToday && real.has(`${accountId}|${day.date}`)) continue;
      snapshots.push({
        user_id: item.user_id,
        item_id: item.item_id,
        account_id: accountId,
        date: day.date,
        value: day.value,
        net_flow: day.net_flow,
        estimated: !isToday
      });
    }
  }
  if (accountIds.length && opts.transactions !== false) {
    await rest(
      `investment_snapshots?estimated=eq.true&account_id=in.(${accountIds.map(encodeURIComponent).join(",")})`,
      { method: "DELETE", headers: { Prefer: "return=minimal" } }
    );
  }
  await upsert("investment_snapshots", "account_id,date", opts.transactions === false ? snapshots.filter((row) => row.estimated === false) : snapshots);
  await setItemStatus(itemsTable2, item.item_id, "ok", null);
  return { status: "ok", accounts: accountIds.length, code: null };
}

// _shared/crypto.ts
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

// _shared/liabilities.ts
var STALE_MS = 24 * 3600 * 1e3;
function table() {
  return mode.sandbox ? "plaid_liabilities_sandbox" : "plaid_liabilities";
}
async function markLiabilitiesStale(itemId) {
  await rest(`${table()}?item_id=eq.${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ stale: true })
  });
}

// _shared/redact.ts
var SECRET_KEY = /token|secret|password|credential|routing|account_number/i;
function redactTokens(value) {
  if (Array.isArray(value)) return value.map(redactTokens);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key2, child] of Object.entries(value)) {
    out[key2] = SECRET_KEY.test(key2) ? "[redacted]" : redactTokens(child);
  }
  return out;
}

// source/index.ts
async function digestHex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function storeLinkWebhook(body) {
  const code = typeof body.webhook_code === "string" ? body.webhook_code : "";
  if (body.webhook_type !== "LINK" || code !== "EVENTS" && code !== "SESSION_FINISHED") return;
  const sessionId = typeof body.link_session_id === "string" ? body.link_session_id : null;
  const rows = [];
  for (const event of Array.isArray(body.events) ? body.events : []) {
    if (!event || typeof event !== "object") continue;
    const redacted = redactTokens(event);
    const given = typeof redacted.event_id === "string" ? redacted.event_id : "";
    rows.push({
      source: "webhook",
      link_session_id: sessionId,
      event_id: given || await digestHex(JSON.stringify(redacted)),
      event_name: typeof redacted.event_name === "string" ? redacted.event_name : null,
      webhook_code: code,
      payload: redacted
    });
  }
  if (code === "SESSION_FINISHED") {
    const redacted = redactTokens(body);
    delete redacted.events;
    rows.push({
      source: "webhook",
      link_session_id: sessionId,
      event_id: `${sessionId ?? "none"}:SESSION_FINISHED`,
      event_name: "SESSION_FINISHED",
      webhook_code: code,
      payload: redacted
    });
  }
  if (rows.length === 0) return;
  await rest("plaid_link_session_events?on_conflict=source,event_id", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify(rows)
  });
}
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
  let body;
  let parsed;
  try {
    parsed = JSON.parse(raw);
    body = parsed;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (body.webhook_type === "LINK") {
    try {
      await storeLinkWebhook(parsed);
    } catch {
      console.error("plaid-webhook: couldn't store link events");
    }
  }
  const state = itemStateFor(body);
  let known = false;
  if (state && body.item_id) {
    known = await updateItemByPlaidID(body.item_id, {
      ...state,
      ...state.status ? { status_updated_at: (/* @__PURE__ */ new Date()).toISOString() } : {}
    });
  }
  if (body.webhook_type === "LIABILITIES" && body.webhook_code === "DEFAULT_UPDATE" && body.item_id) {
    try {
      await markLiabilitiesStale(body.item_id);
    } catch {
      console.error("plaid-webhook: couldn't mark liabilities stale");
    }
  }
  if ((body.webhook_type === "HOLDINGS" || body.webhook_type === "INVESTMENTS_TRANSACTIONS") && body.webhook_code === "DEFAULT_UPDATE" && body.item_id) {
    try {
      const rows = await (await rest(`${itemsTable()}?select=user_id,item_id,access_token_ciphertext&item_id=eq.${encodeURIComponent(body.item_id)}`)).json();
      if (rows[0]) {
        await syncInvestments(
          rows[0],
          await decrypt(rows[0].access_token_ciphertext),
          itemsTable(),
          { transactions: body.webhook_type === "INVESTMENTS_TRANSACTIONS" }
        );
      }
    } catch (error) {
      const code = error instanceof PlaidError ? error.code : "unknown";
      console.error(`plaid-webhook: investments sync failed ${code}`);
    }
  }
  console.log(`plaid-webhook: ${body.webhook_type}/${body.webhook_code}${body.error?.error_code ? ` ${body.error.error_code}` : ""} applied=${!!state} item_known=${known}`);
  return json({ ok: true });
});
