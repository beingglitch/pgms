"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CodeInput } from "@/components/code-input";
import { signIn, resetPasswordWithCode } from "@/app/actions/auth";
import { Lock, KeyRound, Eye, EyeOff } from "lucide-react";

export function LoginClient({ next }: { next?: string }) {
  const [mode, setMode] = useState<"signin" | "recover">("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const recovering = mode === "recover";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    startTransition(async () => {
      // On success these both redirect, so only failures come back with a result.
      const result = recovering
        ? await resetPasswordWithCode(username, recoveryCode, password)
        : await signIn(username, password, next);
      if (result?.error) setError(result.error);
    });
  }

  function toggleMode() {
    setMode((m) => (m === "signin" ? "recover" : "signin"));
    setPassword("");
    setRecoveryCode("");
    setError("");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-muted/60 to-background px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary font-display text-xl font-semibold text-primary-foreground shadow-card">
            PG
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {recovering ? "Reset your password with a recovery code" : "Manage your property's tenants and ledger"}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4 rounded-2xl border bg-background p-6 shadow-card">
          <div>
            <Label className="mb-1.5" htmlFor="username">
              Username
            </Label>
            <Input
              id="username"
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="yourusername"
            />
          </div>

          {recovering && (
            <div>
              <Label className="mb-1.5">6-digit recovery code</Label>
              <CodeInput value={recoveryCode} onChange={setRecoveryCode} />
              <p className="mt-1 text-xs text-muted-foreground">From whoever manages the hosting.</p>
            </div>
          )}

          <div>
            <Label className="mb-1.5" htmlFor="password">
              {recovering ? "New password" : "Password"}
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete={recovering ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">{error}</p>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={
              pending || password.length === 0 || username.length === 0 || (recovering && recoveryCode.length !== 6)
            }
          >
            {recovering ? <KeyRound className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            {pending ? "Please wait…" : recovering ? "Reset password & sign in" : "Sign in"}
          </Button>

          <button
            type="button"
            onClick={toggleMode}
            className="w-full text-center text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            {recovering ? "Back to sign in" : "Forgot password?"}
          </button>

          {!recovering && (
            <p className="text-center text-xs text-muted-foreground">
              New here?{" "}
              <Link href="/signup" className="font-semibold text-primary hover:underline">
                Set up your property
              </Link>
            </p>
          )}
        </form>
      </div>
    </main>
  );
}
