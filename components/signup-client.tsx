"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { signUp } from "@/app/actions/auth";
import { Building2, Eye, EyeOff, ShieldCheck } from "lucide-react";

export function SignupClient() {
  const [pgName, setPgName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    startTransition(async () => {
      // On success this redirects, so only a failure comes back with a result.
      const result = await signUp({ email, password, pgName, ownerName });
      if (result?.error) setError(result.error);
    });
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-card">
            <Building2 className="h-6 w-6" />
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Set up your property</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your own isolated space - nobody else can see your data</p>
        </div>

        <form onSubmit={submit} className="space-y-4 rounded-2xl border bg-background p-6 shadow-card">
          <div>
            <Label className="mb-1.5" htmlFor="pgName">
              Property name
            </Label>
            <Input
              id="pgName"
              autoFocus
              value={pgName}
              onChange={(e) => setPgName(e.target.value)}
              placeholder="e.g. Green Valley PG"
            />
          </div>

          <div>
            <Label className="mb-1.5" htmlFor="ownerName">
              Your name
            </Label>
            <Input id="ownerName" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Owner" />
          </div>

          <div>
            <Label className="mb-1.5" htmlFor="email">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>

          <div>
            <Label className="mb-1.5" htmlFor="password">
              Password
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
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
            disabled={pending || !pgName.trim() || !email.trim() || password.length === 0}
          >
            {pending ? "Please wait…" : "Create account"}
          </Button>

          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Your tenants&apos; ID documents and contact details are stored here, visible only to accounts signed in
            with this email. Choose a password you don&apos;t use elsewhere.
          </p>

          <p className="text-center text-xs text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
