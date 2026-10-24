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

/** Wraps a handler: POST only, parses the JSON body, and turns thrown errors into JSON error responses. */
export function handle(
  fn: (req: Request, body: Record<string, unknown>) => Promise<Response>,
): (req: Request) => Promise<Response> {
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
  if (value === undefined || value === null) return undefined;
  return requireString(body, key);
}
