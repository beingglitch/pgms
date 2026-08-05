"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { createPassword, signIn } from "@/app/actions/auth";
import { Lock, ShieldCheck } from "lucide-react";

export function LoginClient({
  pgName,
  shortName,
  logoUrl,
  needsSetup,
  next,
}: {
  pgName: string;
  shortName: string;
  logoUrl: string | null;
  needsSetup: boolean;
  next?: string;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (needsSetup && password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }

    startTransition(async () => {
      // On success these redirect, so only failures come back with a result.
      const result = needsSetup ? await createPassword(password) : await signIn(password, next);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="mb-4 h-14 w-14 rounded-2xl object-cover shadow-card" />
          ) : (
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary font-display text-xl font-semibold text-primary-foreground shadow-card">
              {shortName}
            </div>
          )}
          <h1 className="font-display text-2xl font-semibold tracking-tight">{pgName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {needsSetup ? "Set a password to protect your records" : "Sign in to continue"}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4 rounded-2xl border bg-background p-6 shadow-card">
          <div>
            <Label className="mb-1.5" htmlFor="password">
              {needsSetup ? "New password" : "Password"}
            </Label>
            <Input
              id="password"
              type="password"
              autoFocus
              autoComplete={needsSetup ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {needsSetup && (
            <div>
              <Label className="mb-1.5" htmlFor="confirm">
                Confirm password
              </Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
              />
            </div>
          )}

          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={pending || password.length === 0}>
            <Lock className="h-4 w-4" />
            {pending ? "Please wait…" : needsSetup ? "Set password & continue" : "Sign in"}
          </Button>

          {needsSetup && (
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Your tenants&apos; ID documents and contact details are stored here. Choose something you don&apos;t use
              elsewhere — at least 8 characters.
            </p>
          )}
        </form>
      </div>
    </main>
  );
}
