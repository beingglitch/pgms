"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  createSessionToken,
  hashPassword,
  verifyPassword,
  verifyRecoveryCode,
  verifySessionToken,
} from "@/lib/auth";
import { logActivity } from "./activity";

async function getSessionAccountId() {
  const jar = await cookies();
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value);
}

export async function isSignedIn() {
  return (await getSessionAccountId()) !== null;
}

/**
 * The signed-in account's id - the first line of nearly every other action,
 * since every scoped query needs it to know which account's data it's
 * allowed to touch. Redirects to /login rather than throwing, same as
 * proxy.ts would have already done for a page request; this covers server
 * actions and API routes that run without going through the page guard.
 */
export async function requireAccountId(): Promise<string> {
  const accountId = await getSessionAccountId();
  if (!accountId) redirect("/login");
  return accountId;
}

/// Guard for anything that isn't already behind proxy.ts, API routes in
/// particular, which are worth defending in depth.
export async function requireAuth() {
  if (!(await isSignedIn())) throw new Error("Not signed in");
}

async function startSession(accountId: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, createSessionToken(accountId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

const USERNAME_RE = /^[a-z0-9_-]{3,24}$/;

function normalizeUsername(raw: string) {
  return raw.trim().toLowerCase();
}

/// Public (no session yet): prefills the signup form with something
/// available, so most people never have to think about a username at all.
export async function suggestUsername(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const candidate = `pg${Math.random().toString(36).slice(2, 7)}`;
    if (!(await prisma.account.findUnique({ where: { username: candidate } }))) return candidate;
  }
  return `pg${Date.now().toString(36)}`;
}

/// Public: live-checked as the signup username field is edited.
export async function checkUsernameAvailable(raw: string): Promise<{ available: boolean; reason?: string }> {
  const username = normalizeUsername(raw);
  if (!USERNAME_RE.test(username)) {
    return { available: false, reason: "3-24 characters: lowercase letters, digits, _ or -." };
  }
  const existing = await prisma.account.findUnique({ where: { username } });
  return existing ? { available: false, reason: "That username is taken." } : { available: true };
}

/// New signup: a fresh, isolated Account, only actually created once the
/// shared developer code checks out - there's no email provider to send a
/// real OTP through, so this stands in for that confirmation step. Lands on
/// /onboarding rather than / since a brand-new account still needs its
/// property set up.
export async function signUp(input: { username: string; email: string; password: string; code: string }) {
  const username = normalizeUsername(input.username);
  const email = input.email.trim().toLowerCase();
  if (!USERNAME_RE.test(username)) return { error: "Choose a valid username first." };
  if (!email.includes("@")) return { error: "Enter a valid email." };
  if (input.password.length < 4) return { error: "Use at least 4 characters." };
  if (!verifyRecoveryCode(input.code)) return { error: "Incorrect code." };

  const [existingUsername, existingEmail] = await Promise.all([
    prisma.account.findUnique({ where: { username } }),
    prisma.account.findUnique({ where: { email } }),
  ]);
  if (existingUsername) return { error: "That username was just taken. Go back and pick another." };
  if (existingEmail) return { error: "An account already exists for that email. Sign in instead." };

  const account = await prisma.account.create({
    data: { username, email, passwordHash: hashPassword(input.password) },
  });
  await startSession(account.id);
  await logActivity(account.id, account.ownerName, "Account created", account.username);
  redirect("/onboarding");
}

export async function signIn(username: string, password: string, next?: string) {
  const account = await prisma.account.findUnique({ where: { username: normalizeUsername(username) } });
  if (!account || !verifyPassword(password, account.passwordHash)) {
    return { error: "Incorrect username or password." };
  }

  await startSession(account.id);
  redirect(next && next.startsWith("/") ? next : "/");
}

export async function signOut() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}

export async function changePassword(actor: string, current: string, next: string) {
  const accountId = await requireAccountId();
  if (next.length < 4) return { error: "Use at least 4 characters." };

  const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
  if (!verifyPassword(current, account.passwordHash)) return { error: "Current password is incorrect." };

  await prisma.account.update({ where: { id: accountId }, data: { passwordHash: hashPassword(next) } });
  await logActivity(accountId, actor, "Password changed", "");
  return { ok: true };
}

/// The forgot-password path: no current password needed, just the recovery
/// code set on the hosting side (DEVELOPER_RECOVERY_CODE) - paired with the
/// account's username, since one global code now has to say *which* account
/// it's resetting rather than "the" property. Everyday password changes
/// should still go through Settings; this is only for lockouts.
export async function resetPasswordWithCode(username: string, code: string, next: string) {
  if (!process.env.DEVELOPER_RECOVERY_CODE) {
    return { error: "Password recovery isn't set up for this property." };
  }
  if (next.length < 4) return { error: "Use at least 4 characters." };
  if (!verifyRecoveryCode(code)) return { error: "Incorrect recovery code." };

  const account = await prisma.account.findUnique({ where: { username: normalizeUsername(username) } });
  if (!account) return { error: "No account with that username." };

  await prisma.account.update({ where: { id: account.id }, data: { passwordHash: hashPassword(next) } });
  await startSession(account.id);
  await logActivity(account.id, "Recovery code", "Password reset", "Reset via developer recovery code");
  redirect("/");
}
