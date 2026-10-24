// Records Edge Function failures (function name and error code only) and emails an alert when they repeat:
// 10 or more 5xx errors in 15 minutes sends at most one email an hour, via Resend when RESEND_API_KEY is set
// (otherwise the alert is only logged). Never throws: monitoring must not break the request it's reporting on.
// Self-contained (no imports from http.ts/supabase.ts) so http.ts can use it.

export const ALERT_THRESHOLD = 10;
export const ALERT_WINDOW_MINUTES = 15;
export const ALERT_COOLDOWN_MINUTES = 60;

function serviceKey(): string | undefined {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const keys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!keys) return undefined;
  try {
    const parsed = JSON.parse(keys) as Record<string, string>;
    return parsed["default"] ?? Object.values(parsed)[0];
  } catch {
    return undefined;
  }
}

async function db(path: string, init: RequestInit = {}): Promise<Response | null> {
  const base = Deno.env.get("SUPABASE_URL"), key = serviceKey();
  if (!base || !key) return null;
  return await fetch(`${base}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

async function count(path: string): Promise<number> {
  const response = await db(path, { method: "HEAD", headers: { Prefer: "count=exact" } });
  return Number(response?.headers.get("Content-Range")?.split("/")[1] ?? 0) || 0;
}

/** Whether `recentErrors` in the window should send an alert, given when the last one went out. */
export function shouldAlert(recentErrors: number, minutesSinceLastAlert: number | null): boolean {
  return recentErrors >= ALERT_THRESHOLD && (minutesSinceLastAlert === null || minutesSinceLastAlert >= ALERT_COOLDOWN_MINUTES);
}

export async function recordFunctionError(functionName: string, code: string, status: number): Promise<void> {
  try {
    await db("function_errors", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ function_name: functionName, code, status }),
    });
    const since = new Date(Date.now() - ALERT_WINDOW_MINUTES * 60_000).toISOString();
    const recent = await count(`function_errors?select=id&created_at=gte.${encodeURIComponent(since)}`);
    if (recent < ALERT_THRESHOLD) return;
    const last = await (await db("alerts_sent?select=created_at&kind=eq.function_errors&order=created_at.desc&limit=1"))?.json() as
      { created_at: string }[] | undefined;
    const minutes = last?.[0] ? (Date.now() - Date.parse(last[0].created_at)) / 60_000 : null;
    if (!shouldAlert(recent, minutes)) return;
    const detail = `${recent} Edge Function errors in ${ALERT_WINDOW_MINUTES} min; latest ${functionName} ${code} (${status})`;
    await db("alerts_sent", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ kind: "function_errors", detail }) });
    await sendAlertEmail("Davey: Edge Functions are failing", `${detail}.\n\nSee Supabase › Edge Functions › Logs and the function_errors table.`);
  } catch {
    console.error("monitor: couldn't record the error");
  }
}

async function sendAlertEmail(subject: string, text: string): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const to = Deno.env.get("ALERT_EMAIL") ?? "herringtondavid11@gmail.com";
  console.error(`ALERT: ${subject}`);
  if (!apiKey) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: Deno.env.get("ALERT_FROM") ?? "Davey Alerts <onboarding@resend.dev>", to: [to], subject, text }),
  });
}
