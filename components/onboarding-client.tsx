"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PhotoUpload } from "@/components/photo-upload";
import { saveOnboardingProperty, saveOnboardingBilling, finishOnboarding } from "@/app/actions/onboarding";
import { createFloor, createRoom } from "@/app/actions/rooms";
import { toast } from "sonner";
import { ArrowRight, Building2, Home, Zap } from "lucide-react";

const ACTOR = "Owner";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const FY_MONTH_ITEMS = Object.fromEntries(MONTH_NAMES.map((name, i) => [String(i + 1), name]));
const LEAD_DAY_ITEMS: Record<string, string> = {
  "0": "On the 1st itself",
  "3": "3 days before",
  "7": "7 days before",
  "10": "10 days before",
  "15": "15 days before",
};
const ORDINAL_FLOOR_NAMES = ["Ground", "First", "Second", "Third", "Fourth", "Fifth"];

// Leaflet touches `window` at module-evaluation time, which breaks server
// rendering - this component (and its import of leaflet) must never run on
// the server, only after hydration in the browser.
const LocationPicker = dynamic(() => import("@/components/location-picker").then((m) => m.LocationPicker), {
  ssr: false,
  loading: () => <div className="h-56 animate-pulse rounded-xl border border-border bg-muted/30" />,
});

type PgInfo = {
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  logoUrl: string | null;
  electricityRatePerUnit: number;
  dueSoonDays: number;
  dueLeadDays: number;
  fiscalYearStartMonth: number;
};

const STEPS = ["Property", "Billing", "Rooms"] as const;

export function OnboardingClient({ pgInfo, floorCount }: { pgInfo: PgInfo; floorCount: number }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState(pgInfo.name === "My PG" ? "" : pgInfo.name);
  const [address, setAddress] = useState(pgInfo.address);
  const [latitude, setLatitude] = useState<number | null>(pgInfo.latitude);
  const [longitude, setLongitude] = useState<number | null>(pgInfo.longitude);

  const [logoUrl, setLogoUrl] = useState(pgInfo.logoUrl ?? "");
  const [rate, setRate] = useState(pgInfo.electricityRatePerUnit);
  const [dueSoonDays, setDueSoonDays] = useState(pgInfo.dueSoonDays);
  const [dueLeadDays, setDueLeadDays] = useState(pgInfo.dueLeadDays);
  const [fiscalYearStartMonth, setFiscalYearStartMonth] = useState(pgInfo.fiscalYearStartMonth);

  const [floorName, setFloorName] = useState(ORDINAL_FLOOR_NAMES[floorCount] ?? `Floor ${floorCount + 1}`);
  const [startNumber, setStartNumber] = useState("101");
  const [singleCount, setSingleCount] = useState(0);
  const [singleRent, setSingleRent] = useState(0);
  const [doubleCount, setDoubleCount] = useState(0);
  const [doubleRent, setDoubleRent] = useState(0);

  async function toBilling() {
    setBusy(true);
    try {
      await saveOnboardingProperty(ACTOR, { name: name.trim() || "My PG", address, latitude, longitude });
      setStep(1);
    } finally {
      setBusy(false);
    }
  }

  async function toRooms() {
    setBusy(true);
    try {
      await saveOnboardingBilling(ACTOR, {
        logoUrl,
        electricityRatePerUnit: rate,
        dueSoonDays,
        dueLeadDays,
        fiscalYearStartMonth,
      });
      setStep(2);
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    setBusy(true);
    try {
      await finishOnboarding(ACTOR);
      router.push("/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function createRoomsAndFinish() {
    const roomsToCreate = singleCount + doubleCount;
    if (roomsToCreate > 0 && !startNumber.trim()) {
      return toast.error("Give the first room a number so the rest can follow on from it.");
    }
    setBusy(true);
    try {
      if (roomsToCreate > 0) {
        const floor = await createFloor(ACTOR, { name: floorName, order: floorCount });
        const asInt = /^\d+$/.test(startNumber.trim());
        const base = asInt ? parseInt(startNumber, 10) : 0;
        let i = 0;
        const nextNumber = () => {
          const value = asInt ? String(base + i) : `${startNumber.trim()}${i + 1}`;
          i += 1;
          return value;
        };
        const specs = [
          ...Array.from({ length: singleCount }, () => ({ capacity: 1, rentAmount: singleRent })),
          ...Array.from({ length: doubleCount }, () => ({ capacity: 2, rentAmount: doubleRent })),
        ];
        for (const spec of specs) {
          await createRoom(ACTOR, { floorId: floor.id, number: nextNumber(), ...spec });
        }
      }
      await finish();
    } catch {
      toast.error("That floor or room number is already taken.");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-muted/60 to-background px-5 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary font-display text-xl font-semibold text-primary-foreground shadow-card">
            PG
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Let&apos;s set up your property</h1>
          <p className="mt-1 text-sm text-muted-foreground">A few quick steps, most of it optional or skippable.</p>
        </div>

        <div className="mb-5 flex items-center justify-center gap-2">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${
                  i === step ? "bg-primary text-primary-foreground" : i < step ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                }`}
              >
                {i + 1}
              </div>
              {i < STEPS.length - 1 && <div className={`h-0.5 w-6 rounded-full ${i < step ? "bg-primary/40" : "bg-muted"}`} />}
            </div>
          ))}
        </div>

        <div className="space-y-4 rounded-2xl border bg-background p-6 shadow-card">
          {step === 0 && (
            <>
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <p className="font-display text-base font-semibold tracking-tight">Property</p>
              </div>
              <div>
                <Label className="mb-1.5">PG name</Label>
                <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Green Valley PG" />
              </div>
              <div>
                <Label className="mb-1.5">Location (optional)</Label>
                <LocationPicker
                  latitude={latitude}
                  longitude={longitude}
                  address={address}
                  onChange={(v) => {
                    setLatitude(v.latitude);
                    setLongitude(v.longitude);
                    setAddress(v.address);
                  }}
                />
              </div>
              <Button className="w-full" onClick={toBilling} disabled={busy}>
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            </>
          )}

          {step === 1 && (
            <>
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-muted-foreground" />
                <p className="font-display text-base font-semibold tracking-tight">Electricity, logo &amp; billing</p>
              </div>
              <div>
                <Label className="mb-1.5">Logo</Label>
                <PhotoUpload value={logoUrl} onChange={setLogoUrl} label="Upload logo" downloadName="logo.png" />
                <p className="mt-1 text-xs text-muted-foreground">Printed on every tenant PDF you download.</p>
              </div>
              <div>
                <Label className="mb-1.5">Electricity rate (₹ per unit)</Label>
                <Input type="number" value={rate} onChange={(e) => setRate(Number(e.target.value))} />
              </div>
              <div>
                <Label className="mb-1.5">&ldquo;Due soon&rdquo; window</Label>
                <Select
                  items={{ "7": "7 days", "14": "14 days", "30": "30 days", "60": "60 days" }}
                  value={String(dueSoonDays)}
                  onValueChange={(v) => v && setDueSoonDays(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 days</SelectItem>
                    <SelectItem value="14">14 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="60">60 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1.5">Create next month&apos;s rent</Label>
                <Select items={LEAD_DAY_ITEMS} value={String(dueLeadDays)} onValueChange={(v) => v && setDueLeadDays(Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(LEAD_DAY_ITEMS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1.5">Financial year starts in</Label>
                <Select items={FY_MONTH_ITEMS} value={String(fiscalYearStartMonth)} onValueChange={(v) => v && setFiscalYearStartMonth(Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTH_NAMES.map((label, i) => (
                      <SelectItem key={label} value={String(i + 1)}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setStep(0)} disabled={busy}>
                  Back
                </Button>
                <Button className="flex-1" onClick={toRooms} disabled={busy}>
                  Continue <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="flex items-center gap-2">
                <Home className="h-4 w-4 text-muted-foreground" />
                <p className="font-display text-base font-semibold tracking-tight">Rooms</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Set up your first floor now, or skip and add rooms later from the Rooms page.
              </p>
              <div>
                <Label className="mb-1.5">Floor name</Label>
                <Input value={floorName} onChange={(e) => setFloorName(e.target.value)} placeholder="Ground, First…" />
              </div>
              <div>
                <Label className="mb-1.5">First room number</Label>
                <Input value={startNumber} onChange={(e) => setStartNumber(e.target.value)} placeholder="101" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-1.5">Single-sharing rooms</Label>
                  <Input type="number" min={0} value={singleCount} onChange={(e) => setSingleCount(Math.max(0, Number(e.target.value)))} />
                </div>
                <div>
                  <Label className="mb-1.5">Rent per room</Label>
                  <Input type="number" value={singleRent || ""} onChange={(e) => setSingleRent(Number(e.target.value))} disabled={singleCount === 0} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-1.5">Double-sharing rooms</Label>
                  <Input type="number" min={0} value={doubleCount} onChange={(e) => setDoubleCount(Math.max(0, Number(e.target.value)))} />
                </div>
                <div>
                  <Label className="mb-1.5">Rent per room</Label>
                  <Input type="number" value={doubleRent || ""} onChange={(e) => setDoubleRent(Number(e.target.value))} disabled={doubleCount === 0} />
                </div>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setStep(1)} disabled={busy}>
                  Back
                </Button>
                <Button variant="secondary" className="flex-1" onClick={finish} disabled={busy}>
                  Skip for now
                </Button>
                <Button className="flex-1" onClick={createRoomsAndFinish} disabled={busy}>
                  Finish
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
