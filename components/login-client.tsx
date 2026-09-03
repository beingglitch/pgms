"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CodeInput } from "@/components/code-input";
import { AuthShell } from "@/components/auth-shell";
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
    <AuthShell
      title="Run your PG like clockwork."
      subtitle="Rent, tenants, electricity readings, and the ledger — all in one place, from your phone."
    >
      <div className="mb-8 lg:hidden">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary font-display text-base font-semibold text-primary-foreground">
          PG
        </div>
      </div>

      <h1 className="font-display text-3xl font-semibold tracking-tight">{recovering ? "Reset password" : "Sign in"}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {recovering
          ? "Use the recovery code from whoever manages the hosting."
          : "Welcome back — manage your property's tenants and ledger."}
      </p>

      <form onSubmit={submit} className="mt-8 space-y-4">
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
          size="lg"
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
          <p className="text-center text-sm text-muted-foreground">
            New here?{" "}
            <Link href="/signup" className="font-semibold text-primary hover:underline">
              Set up your property
            </Link>
          </p>
        )}
      </form>
    </AuthShell>
  );
}
