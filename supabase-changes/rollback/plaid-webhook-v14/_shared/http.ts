// JSON responses and errors shared by all functions.
import { recordFunctionError } from "./monitor.ts";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
};

/** Davey on the web (daveypersonalfinance.com/app): the only origins allowed to call signed-in functions. */
export const APP_ORIGINS = ["https://daveypersonalfinance.com", "https://www.daveypersonalfinance.com"];

/** CORS headers for a signed-in function: only for Davey's web origins (the iPhone and Mac apps send no Origin). */
export function appCorsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !APP_ORIGINS.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

/**
 * Wraps a handler: POST only, parses the JSON body, and turns thrown errors into JSON error responses.
 * `cors: true`: public endpoints any page may call (no credentials). `cors: "app"`: signed-in functions Davey on the
 * web calls, for its origins only.
 */
export function handle(
  fn: (req: Request, body: Record<string, unknown>) => Promise<Response>,
  options: { cors?: boolean | "app" } = {},
): (req: Request) => Promise<Response> {
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
    // Public endpoints the website calls from the browser (no credentials).
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
      let body: Record<string, unknown> = {};
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
      // Never log request bodies, tokens, or amounts.
      console.error("Unhandled error:", error instanceof Error ? error.name : typeof error);
      await recordFunctionError(functionName(req), error instanceof Error ? error.name : "unknown", 500);
      return json({ error: "internal", message: "Something went wrong." }, 500);
    }
  };
}

/** The function's name from its URL (/functions/v1/<name>). */
function functionName(req: Request): string {
  try {
    return new URL(req.url).pathname.split("/").filter(Boolean).pop() ?? "unknown";
  } catch {
    return "unknown";
  }
}

export function requireString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || value.length === 0 || value.length > 512) {
    throw new HttpError(400, "invalid_request", `Missing or invalid "${key}".`);
  }
  return value;
}

export function optionalString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  // An empty string means "not given" (the app sends "" when it has no name yet): never an error.
  if (value === undefined || value === null || value === "") return undefined;
  return requireString(body, key);
}
