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
import { getPgInfo } from "./settings";

export async function isSignedIn() {
  const jar = await cookies();
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value);
}

/// Guard for anything that isn't already behind proxy.ts, API routes in
/// particular, which are worth defending in depth.
export async function requireAuth() {
  if (!(await isSignedIn())) throw new Error("Not signed in");
}

export async function isPasswordSet() {
  const info = await getPgInfo();
  return info.passwordHash !== "";
}

async function startSession() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

/// First-run setup. Refuses once a password exists so this can't be used to
/// take over an already-configured property.
export async function createPassword(password: string) {
  if (password.length < 8) return { error: "Use at least 8 characters." };
  const info = await getPgInfo();
  if (info.passwordHash) return { error: "A password is already set. Sign in instead." };

  await prisma.pgInfo.update({
    where: { id: "singleton" },
    data: { passwordHash: hashPassword(password) },
  });
  await startSession();
  await logActivity(info.ownerName, "Password created", "First-time setup");
  redirect("/");
}

export async function signIn(password: string, next?: string) {
  const info = await getPgInfo();
  if (!info.passwordHash) return { error: "No password set yet." };
  if (!verifyPassword(password, info.passwordHash)) return { error: "Incorrect password." };

  await startSession();
  redirect(next && next.startsWith("/") ? next : "/");
}

export async function signOut() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}

export async function changePassword(actor: string, current: string, next: string) {
  await requireAuth();
  if (next.length < 8) return { error: "Use at least 8 characters." };

  const info = await getPgInfo();
  if (!verifyPassword(current, info.passwordHash)) return { error: "Current password is incorrect." };

  await prisma.pgInfo.update({
    where: { id: "singleton" },
    data: { passwordHash: hashPassword(next) },
  });
  await logActivity(actor, "Password changed", "");
  return { ok: true };
}

/// The forgot-password path: no current password needed, just the recovery
/// code set on the hosting side (DEVELOPER_RECOVERY_CODE). Everyday password
/// changes should still go through Settings; this is only for lockouts.
export async function resetPasswordWithCode(code: string, next: string) {
  if (!process.env.DEVELOPER_RECOVERY_CODE) {
    return { error: "Password recovery isn't set up for this property." };
  }
  if (next.length < 8) return { error: "Use at least 8 characters." };
  if (!verifyRecoveryCode(code)) return { error: "Incorrect recovery code." };

  await prisma.pgInfo.update({
    where: { id: "singleton" },
    data: { passwordHash: hashPassword(next) },
  });
  await startSession();
  await logActivity("Recovery code", "Password reset", "Reset via developer recovery code");
  redirect("/");
}
