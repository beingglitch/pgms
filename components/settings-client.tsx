"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ClipboardList } from "lucide-react";
import { updatePgInfo } from "@/app/actions/settings";
import { PhotoUpload } from "@/components/photo-upload";
import { useManager } from "@/lib/manager-context";
import { toast } from "sonner";
import type { PgInfoModel, ActivityLogModel } from "@/lib/generated/prisma/models";

export function SettingsClient({ pgInfo, activity }: { pgInfo: PgInfoModel; activity: ActivityLogModel[] }) {
  const router = useRouter();
  const { manager, setManager } = useManager();
  const [pg, setPg] = useState(pgInfo);
  const [rate, setRate] = useState(Number(pgInfo.electricityRatePerUnit));
  const [ownerDraft, setOwnerDraft] = useState(manager);
  const [showLog, setShowLog] = useState(false);

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
    });
    toast.success("Saved");
    router.refresh();
  }

  function saveOwnerName() {
    setManager(ownerDraft);
    toast.success("Saved");
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-3 p-4">
          <p className="mb-1 font-semibold">Your name</p>
          <p className="text-xs text-muted-foreground">
            Shown on every ledger entry, reminder, and edit you make — your accountability trail.
          </p>
          <div className="flex gap-2">
            <Input value={ownerDraft} onChange={(e) => setOwnerDraft(e.target.value)} />
            <Button onClick={saveOwnerName}>Save</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <p className="mb-1 font-semibold">Property details</p>
          <div>
            <Label className="mb-1">PG name</Label>
            <Input value={pg.name} onChange={(e) => setPg({ ...pg, name: e.target.value })} placeholder="e.g. Sukoon Niwas PG" />
          </div>
          <div>
            <Label className="mb-1">Short name / initials (for app icon)</Label>
            <Input
              value={pg.shortName}
              onChange={(e) => setPg({ ...pg, shortName: e.target.value.slice(0, 4) })}
              placeholder="e.g. SN"
              maxLength={4}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Shown as the badge on the home screen icon and browser tab if no logo is uploaded.
            </p>
          </div>
          <div>
            <Label className="mb-1">Logo (optional)</Label>
            <PhotoUpload value={pg.logoUrl} onChange={(url) => setPg({ ...pg, logoUrl: url })} label="Upload logo" />
            <p className="mt-1 text-xs text-muted-foreground">
              Used as the app icon everywhere, including when installed as a PWA. Falls back to the initials above if
              not set.
            </p>
          </div>
          <div>
            <Label className="mb-1">Address</Label>
            <Input value={pg.address} onChange={(e) => setPg({ ...pg, address: e.target.value })} />
          </div>
          <div>
            <Label className="mb-1">Contact number</Label>
            <Input value={pg.contact} onChange={(e) => setPg({ ...pg, contact: e.target.value })} />
          </div>
          <div>
            <Label className="mb-1">Total beds</Label>
            <Input type="number" value={pg.totalBeds} onChange={(e) => setPg({ ...pg, totalBeds: Number(e.target.value) })} />
          </div>
          <div>
            <Label className="mb-1">Default payment link</Label>
            <Input value={pg.paymentLink} onChange={(e) => setPg({ ...pg, paymentLink: e.target.value })} placeholder="https://…" />
          </div>
          <div>
            <Label className="mb-1">Electricity rate (₹ per unit)</Label>
            <Input type="number" value={rate} onChange={(e) => setRate(Number(e.target.value))} />
            <p className="mt-1 text-xs text-muted-foreground">
              Used to auto-calculate room and main meter electricity bills.
            </p>
          </div>
          <Button onClick={saveDetails}>Save details</Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <p className="mb-1 font-semibold">Activity log</p>
          <p className="mb-3 text-xs text-muted-foreground">Every action you take is recorded here.</p>
          <Button variant="outline" size="sm" onClick={() => setShowLog((s) => !s)}>
            <ClipboardList className="h-3.5 w-3.5" /> {showLog ? "Hide" : "View"} activity log
          </Button>
          {showLog && (
            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
              {activity.length === 0 && <p className="text-xs text-muted-foreground">No activity yet.</p>}
              {activity.map((l) => (
                <div key={l.id} className="border-b pb-2 text-xs">
                  <span className="font-semibold">{l.actor}</span> · {l.action} —{" "}
                  <span className="text-muted-foreground">{l.detail}</span>
                  <div className="text-muted-foreground">{new Date(l.ts).toLocaleString("en-IN")}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
