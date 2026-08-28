"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, KeyRound, Loader2 } from "lucide-react";
import { updatePgInfo } from "@/app/actions/settings";
import { changePassword } from "@/app/actions/auth";
import { exportAllData } from "@/app/actions/reports";
import { PhotoUpload } from "@/components/photo-upload";
import { PageTitle, Panel } from "@/components/khata";
import { useManager } from "@/lib/manager-context";
import { toast } from "sonner";
import type { PgInfoModel } from "@/lib/generated/prisma/models";

type PgInfo = Omit<PgInfoModel, "electricityRatePerUnit"> & { electricityRatePerUnit: number };

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const FY_MONTH_ITEMS = Object.fromEntries(MONTH_NAMES.map((name, i) => [String(i + 1), name]));
const LEAD_DAY_ITEMS: Record<string, string> = {
  "0": "On the 1st itself",
  "3": "3 days before",
  "7": "7 days before",
  "10": "10 days before",
  "15": "15 days before",
};

export function SettingsClient({ pgInfo }: { pgInfo: PgInfo }) {
  const router = useRouter();
  const { manager, setManager } = useManager();
  const [pg, setPg] = useState(pgInfo);
  const [rate, setRate] = useState(Number(pgInfo.electricityRatePerUnit));
  const [ownerDraft, setOwnerDraft] = useState(manager);
  const [exporting, setExporting] = useState(false);

  async function saveDetails() {
    await updatePgInfo(manager, {
      name: pg.name,
      shortName: pg.shortName,
      logoUrl: pg.logoUrl || "",
      address: pg.address,
      contact: pg.contact,
      totalBeds: pg.totalBeds,
      paymentLink: pg.paymentLink,
      electricityRatePerUnit: rate,
      dueSoonDays: pg.dueSoonDays,
      dueLeadDays: pg.dueLeadDays,
      fiscalYearStartMonth: pg.fiscalYearStartMonth,
    });
    toast.success("Settings saved");
    router.refresh();
  }

  /**
   * The export is zipped client-side from plain CSV strings so no archive
   * dependency is needed on the server.
   */
  async function downloadExport() {
    setExporting(true);
    try {
      const files = await exportAllData();
      const stamp = new Date().toISOString().slice(0, 10);

      for (const [name, contents] of Object.entries(files)) {
        if (!contents) continue;
        const blob = new Blob([contents], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${pg.shortName || "pg"}-${stamp}-${name}`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        // Browsers drop rapid-fire downloads, so space them out.
        await new Promise((r) => setTimeout(r, 350));
      }
      toast.success("Export downloaded");
    } catch {
      toast.error("Export failed. Try again.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageTitle>Settings</PageTitle>

      <Panel className="space-y-3">
        <div>
          <p className="font-display text-base font-semibold tracking-tight">Your name</p>
          <p className="text-xs text-muted-foreground">
            Shown on every ledger entry, reminder, and edit you make: your accountability trail.
          </p>
        </div>
        <div className="flex gap-2">
          <Input value={ownerDraft} onChange={(e) => setOwnerDraft(e.target.value)} />
          <Button
            onClick={() => {
              setManager(ownerDraft);
              toast.success("Saved");
            }}
          >
            Save
          </Button>
        </div>
      </Panel>

      <Panel className="space-y-3">
        <p className="font-display text-base font-semibold tracking-tight">Property details</p>
        <div>
          <Label className="mb-1.5">PG name</Label>
          <Input value={pg.name} onChange={(e) => setPg({ ...pg, name: e.target.value })} placeholder="Sukoon Niwas PG" />
        </div>
        <div>
          <Label className="mb-1.5">Short name / initials</Label>
          <Input
            value={pg.shortName}
            onChange={(e) => setPg({ ...pg, shortName: e.target.value.slice(0, 4) })}
            placeholder="SN"
            maxLength={4}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Used on the home-screen icon and browser tab when no logo is set.
          </p>
        </div>
        <div>
          <Label className="mb-1.5">Logo</Label>
          <PhotoUpload value={pg.logoUrl} onChange={(url) => setPg({ ...pg, logoUrl: url })} label="Upload logo" />
        </div>
        <div>
          <Label className="mb-1.5">Address</Label>
          <Input value={pg.address} onChange={(e) => setPg({ ...pg, address: e.target.value })} />
        </div>
        <div>
          <Label className="mb-1.5">Contact number</Label>
          <Input value={pg.contact} onChange={(e) => setPg({ ...pg, contact: e.target.value })} />
          <p className="mt-1 text-xs text-muted-foreground">Added to the sign-off on receipts and reminders.</p>
        </div>
        <div>
          <Label className="mb-1.5">Default payment link</Label>
          <Input
            value={pg.paymentLink}
            onChange={(e) => setPg({ ...pg, paymentLink: e.target.value })}
            placeholder="https://…"
          />
        </div>
        <Button onClick={saveDetails}>Save details</Button>
      </Panel>

      <Panel className="space-y-3">
        <div>
          <p className="font-display text-base font-semibold tracking-tight">Rent &amp; billing</p>
          <p className="text-xs text-muted-foreground">
            Rent is billed automatically each month on the day a tenant joined on. How it&apos;s split and chased:
          </p>
        </div>
        <div>
          <Label className="mb-1.5">&ldquo;Due soon&rdquo; window</Label>
          <Select
            items={{ "7": "7 days", "14": "14 days", "30": "30 days", "60": "60 days" }}
            value={String(pg.dueSoonDays)}
            onValueChange={(v) => v && setPg({ ...pg, dueSoonDays: Number(v) })}
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
          <p className="mt-1 text-xs text-muted-foreground">Drives the dashboard counter.</p>
        </div>
        <div>
          <Label className="mb-1.5">Create next month&apos;s rent</Label>
          <Select
            items={LEAD_DAY_ITEMS}
            value={String(pg.dueLeadDays)}
            onValueChange={(v) => v && setPg({ ...pg, dueLeadDays: Number(v) })}
          >
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
          <p className="mt-1 text-xs text-muted-foreground">
            Rent is due on the 1st of every month. This is how far ahead the charge appears, so you can start
            chasing it before the month begins.
          </p>
        </div>
        <div>
          <Label className="mb-1.5">Electricity rate (₹ per unit)</Label>
          <Input type="number" value={rate} onChange={(e) => setRate(Number(e.target.value))} />
        </div>
        <div>
          <Label className="mb-1.5">Financial year starts in</Label>
          <Select
            items={FY_MONTH_ITEMS}
            value={String(pg.fiscalYearStartMonth)}
            onValueChange={(v) => v && setPg({ ...pg, fiscalYearStartMonth: Number(v) })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTH_NAMES.map((name, i) => (
                <SelectItem key={name} value={String(i + 1)}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">
            Drives the dashboard&apos;s &ldquo;collected this year&rdquo; figure. India&apos;s FY is April.
          </p>
        </div>
        <Button onClick={saveDetails}>Save billing settings</Button>
      </Panel>

      <PasswordPanel manager={manager} />

      <Panel className="space-y-3">
        <div>
          <p className="font-display text-base font-semibold tracking-tight">Export your data</p>
          <p className="text-xs text-muted-foreground">
            Downloads every table as CSV: tenants, payments, charges, electricity, expenses, agreements, rooms,
            reminders, and the activity log. Keep a copy somewhere off this server.
          </p>
        </div>
        <Button variant="outline" onClick={downloadExport} disabled={exporting}>
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {exporting ? "Preparing…" : "Download all data (CSV)"}
        </Button>
      </Panel>
    </div>
  );
}

function PasswordPanel({ manager }: { manager: string }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (next !== confirm) return toast.error("The new passwords don't match.");
    setBusy(true);
    const result = await changePassword(manager, current, next);
    setBusy(false);

    if (result?.error) return toast.error(result.error);
    toast.success("Password changed");
    setCurrent("");
    setNext("");
    setConfirm("");
  }

  return (
    <Panel className="space-y-3">
      <div>
        <p className="font-display text-base font-semibold tracking-tight">Password</p>
        <p className="text-xs text-muted-foreground">
          This is what stands between the internet and your tenants&apos; ID documents.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Input
          type="password"
          placeholder="Current password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
        <Input
          type="password"
          placeholder="New password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
        <Input
          type="password"
          placeholder="Confirm new"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      <Button variant="outline" onClick={submit} disabled={busy || !current || !next}>
        <KeyRound className="h-4 w-4" /> Change password
      </Button>
    </Panel>
  );
}
