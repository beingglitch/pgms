type DecimalLike = { toFixed(digits?: number): string; toNumber(): number };

/** The same shape with every Prisma Decimal replaced by a plain number. */
export type Serialised<T> = T extends DecimalLike
  ? number
  : T extends Date
    ? T
    : T extends (infer U)[]
      ? Serialised<U>[]
      : T extends object
        ? { [K in keyof T]: Serialised<T[K]> }
        : T;

/**
 * Prisma's Decimal isn't a plain object, so it can't cross the Server
 * Component -> Client Component boundary as-is. This walks any value
 * (a tenant, a room, a list of either, arbitrarily nested) and converts
 * every Decimal it finds to a plain number, leaving everything else -
 * including Dates - untouched.
 */
export function serialise<T>(value: T): Serialised<T> {
  if (value === null || value === undefined) return value as Serialised<T>;
  if (value instanceof Date) return value as Serialised<T>;
  if (Array.isArray(value)) return value.map((v) => serialise(v)) as Serialised<T>;
  if (typeof value === "object") {
    const maybeDecimal = value as Partial<DecimalLike>;
    if (typeof maybeDecimal.toFixed === "function" && typeof maybeDecimal.toNumber === "function") {
      return maybeDecimal.toNumber() as Serialised<T>;
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = serialise(v);
    return out as Serialised<T>;
  }
  return value as Serialised<T>;
}
