import { API_URL } from "../env";
import { authHeaders } from "../auth/session";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** Sent as JSON, unless it's a Blob, which goes as-is with its own type. */
  body?: unknown;
  query?: Record<string, string | undefined>;
  signal?: AbortSignal;
}

export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = new URL(API_URL + path);
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) url.searchParams.set(k, v);
  const headers: Record<string, string> = { Accept: "application/json", ...(await authHeaders()) };
  const raw = opts.body instanceof Blob;
  if (opts.body !== undefined) headers["Content-Type"] = raw ? (opts.body as Blob).type : "application/json";
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body === undefined ? undefined : raw ? (opts.body as Blob) : JSON.stringify(opts.body),
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, `Can't reach the API at ${API_URL}`);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = undefined;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const body = data as { error?: string; details?: unknown } | string | undefined;
    const message = typeof body === "object" && body?.error ? body.error : typeof body === "string" && body ? body : res.statusText;
    throw new ApiError(res.status, message || `HTTP ${res.status}`, typeof body === "object" ? body?.details : undefined);
  }
  return data as T;
}

/** Fetches an authenticated image (img tags can't send our headers) as an object URL. */
export async function apiObjectUrl(path: string): Promise<string | null> {
  const res = await fetch(API_URL + path, { headers: await authHeaders() });
  if (!res.ok) return null;
  return URL.createObjectURL(await res.blob());
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.status ? `${e.message}` : e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}
