import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "pg_session";
const SESSION_DAYS = 30;
export const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;

/// Sessions are signed with AUTH_SECRET. If it isn't set we fall back to the
/// database URL, which is always present and secret enough to keep the app
/// working out of the box. Set AUTH_SECRET in production, though, so that
/// rotating database credentials doesn't sign everyone out.
function secret() {
  const s = process.env.AUTH_SECRET || process.env.DATABASE_URL;
  if (!s) throw new Error("Set AUTH_SECRET (or DATABASE_URL) so sessions can be signed.");
  return s;
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("hex");
}

function safeEqual(a: string, b: string) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, key] = (stored || "").split(":");
  if (!salt || !key) return false;
  return safeEqual(scryptSync(password, salt, 64).toString("hex"), key);
}

export function createSessionToken() {
  const expiry = String(Date.now() + SESSION_MAX_AGE * 1000);
  return `${expiry}.${sign(expiry)}`;
}

export function verifySessionToken(token: string | undefined | null) {
  const [expiry, signature] = (token || "").split(".");
  if (!expiry || !signature) return false;
  if (!safeEqual(signature, sign(expiry))) return false;
  return Number(expiry) > Date.now();
}

/// A separate escape hatch from the password itself: whoever manages the
/// hosting (Vercel project settings) sets DEVELOPER_RECOVERY_CODE, and can
/// hand it to the owner to reset a forgotten password without needing the
/// old one. Unset by default, so recovery is opt-in rather than a standing
/// backdoor on every deployment.
export function verifyRecoveryCode(code: string) {
  const configured = process.env.DEVELOPER_RECOVERY_CODE;
  if (!configured) return false;
  return safeEqual(code, configured);
}
