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

/// New signup: a fresh, isolated Account. Replaces the old single-property
/// "first run" password screen now that there can be many properties.
export async function signUp(input: { email: string; password: string; pgName: string; ownerName: string }) {
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) return { error: "Enter a valid email." };
  if (input.password.length < 4) return { error: "Use at least 4 characters." };
  if (!input.pgName.trim()) return { error: "Give your property a name." };

  const existing = await prisma.account.findUnique({ where: { email } });
  if (existing) return { error: "An account already exists for that email. Sign in instead." };

  const account = await prisma.account.create({
    data: {
      email,
      name: input.pgName.trim(),
      ownerName: input.ownerName.trim() || "Owner",
      passwordHash: hashPassword(input.password),
    },
  });
  await startSession(account.id);
  await logActivity(account.id, account.ownerName, "Account created", account.name);
  redirect("/");
}

export async function signIn(email: string, password: string, next?: string) {
  const account = await prisma.account.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!account || !verifyPassword(password, account.passwordHash)) {
    return { error: "Incorrect email or password." };
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
/// account's email, since one global code now has to say *which* account
/// it's resetting rather than "the" property. Everyday password changes
/// should still go through Settings; this is only for lockouts.
export async function resetPasswordWithCode(email: string, code: string, next: string) {
  if (!process.env.DEVELOPER_RECOVERY_CODE) {
    return { error: "Password recovery isn't set up for this property." };
  }
  if (next.length < 4) return { error: "Use at least 4 characters." };
  if (!verifyRecoveryCode(code)) return { error: "Incorrect recovery code." };

  const account = await prisma.account.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!account) return { error: "No account with that email." };

  await prisma.account.update({ where: { id: account.id }, data: { passwordHash: hashPassword(next) } });
  await startSession(account.id);
  await logActivity(account.id, "Recovery code", "Password reset", "Reset via developer recovery code");
  redirect("/");
}
