"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CodeInput } from "@/components/code-input";
import { suggestUsername, checkUsernameAvailable, signUp } from "@/app/actions/auth";
import { Building2, Check, Eye, EyeOff, Loader2, ShieldCheck, X } from "lucide-react";

type Availability = { state: "idle" | "checking" | "available" | "taken" | "invalid"; reason?: string };

export function SignupClient() {
  const [step, setStep] = useState<"details" | "confirm">("details");
  const [username, setUsername] = useState("");
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [availability, setAvailability] = useState<Availability>({ state: "idle" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    suggestUsername().then(setUsername);
  }, []);

  const checkSeq = useRef(0);
  useEffect(() => {
    if (!usernameTouched) return;
    const seq = ++checkSeq.current;
    const timer = setTimeout(async () => {
      const result = await checkUsernameAvailable(username);
      if (checkSeq.current !== seq) return;
      setAvailability(
        result.available ? { state: "available" } : { state: result.reason?.includes("taken") ? "taken" : "invalid", reason: result.reason }
      );
    }, 400);
    return () => clearTimeout(timer);
  }, [username, usernameTouched]);

  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const detailsValid =
    username.length > 0 &&
    availability.state !== "taken" &&
    availability.state !== "invalid" &&
    email.includes("@") &&
    password.length >= 4 &&
    passwordsMatch;

  function continueToConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!detailsValid) return;
    setStep("confirm");
  }

  function submit() {
    setError("");
    startTransition(async () => {
      // On success this redirects, so only a failure comes back with a result.
      const result = await signUp({ username, email, password, code });
      if (result?.error) setError(result.error);
    });
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-muted/60 to-background px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-card">
            <Building2 className="h-6 w-6" />
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Set up your property</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your own isolated space - nobody else can see your data</p>
        </div>

        {step === "details" ? (
          <form onSubmit={continueToConfirm} className="space-y-4 rounded-2xl border bg-background p-6 shadow-card">
            <div>
              <Label className="mb-1.5" htmlFor="username">
                Username
              </Label>
              <div className="relative">
                <Input
                  id="username"
                  autoFocus
                  autoComplete="username"
                  value={username}
                  onChange={(e) => {
                    setUsernameTouched(true);
                    setAvailability({ state: "checking" });
                    setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""));
                  }}
                  className="pr-8"
                />
                <span className="absolute inset-y-0 right-0 flex w-8 items-center justify-center">
                  {availability.state === "checking" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  {availability.state === "available" && <Check className="h-4 w-4 text-emerald-600" />}
                  {(availability.state === "taken" || availability.state === "invalid") && (
                    <X className="h-4 w-4 text-destructive" />
                  )}
                </span>
              </div>
              <p className={`mt-1 text-xs ${availability.state === "taken" || availability.state === "invalid" ? "text-destructive" : "text-muted-foreground"}`}>
                {availability.reason ?? "Auto-generated, but yours to change."}
              </p>
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

            <div>
              <Label className="mb-1.5" htmlFor="confirmPassword">
                Confirm password
              </Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {confirmPassword.length > 0 && !passwordsMatch && (
                <p className="mt-1 text-xs text-destructive">Passwords don&apos;t match.</p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={!detailsValid}>
              Continue
            </Button>

            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Your tenants&apos; ID documents and contact details are stored here, visible only to accounts signed in
              to this one.
            </p>

            <p className="text-center text-xs text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="font-semibold text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </form>
        ) : (
          <div className="space-y-4 rounded-2xl border bg-background p-6 shadow-card">
            <div>
              <Label className="mb-1.5">6-digit confirmation code</Label>
              <CodeInput value={code} onChange={setCode} autoFocus />
              <p className="mt-1 text-xs text-muted-foreground">From whoever manages the hosting.</p>
            </div>

            {error && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">{error}</p>
            )}

            <div className="flex gap-3">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setStep("details")}>
                Back
              </Button>
              <Button type="button" className="flex-1" onClick={submit} disabled={pending || code.length !== 6}>
                {pending ? "Please wait…" : "Create account"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
