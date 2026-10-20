export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = "not found") => new HttpError(404, what);
export const forbidden = (why = "not allowed") => new HttpError(403, why);

/**
 * Parses a PATCH body with `schema.partial()` but keeps only keys the client sent: Zod 4 applies
 * `.default()` values even to omitted optional keys, which would silently reset fields.
 */
export function parsePatch<T extends object>(schema: { parse(v: unknown): T }, body: unknown): Partial<T> {
  const parsed = schema.parse(body ?? {}) as Record<string, unknown>;
  const sent = body && typeof body === "object" ? body : {};
  return Object.fromEntries(Object.entries(parsed).filter(([k]) => k in sent)) as Partial<T>;
}
