"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  IndianRupee,
  BellRing,
  MessageCircle,
  Pencil,
  LogOut,
  Trash2,
  FileText,
  History,
  Zap,
  CreditCard,
  Car,
  MapPin,
  Phone,
} from "lucide-react";
import { inr, fmtDate } from "@/lib/format";
import { deleteTenant, getTenant } from "@/app/actions/tenants";
import { deleteElectricityBill } from "@/app/actions/electricity";
import { useManager } from "@/lib/manager-context";
import { TenantFormDialog } from "@/components/tenant-form-dialog";
import { CheckoutDialog } from "@/components/checkout-dialog";
import { LedgerFormDialog } from "@/components/ledger-form-dialog";
import { ReminderFormDialog } from "@/components/reminder-form-dialog";
import { AgreementFormDialog } from "@/components/agreement-form-dialog";
import { MeterReadingDialog } from "@/components/meter-reading-dialog";
import { SendMessageDialog } from "@/components/send-message-dialog";
import { toast } from "sonner";

type TenantDetail = NonNullable<Awaited<ReturnType<typeof getTenant>>>;

export function TenantDetailClient({
  tenant,
  paymentLink,
  pgName,
  electricityRate,
}: {
  tenant: TenantDetail;
  paymentLink: string;
  pgName: string;
  electricityRate: number;
}) {
  const router = useRouter();
  const { manager } = useManager();
  const [editOpen, setEditOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [remOpen, setRemOpen] = useState(false);
  const [agreementOpen, setAgreementOpen] = useState(false);
  const [electricityOpen, setElectricityOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [shareMsg, setShareMsg] = useState<{ title: string; subject: string; message: string } | null>(null);

  const currentAgreement = tenant.agreements[0];
  const totalPaid = tenant.ledgerEntries.filter((e) => e.type === "RENT").reduce((s, e) => s + Number(e.amount), 0);

  const reminderMsg = `Hi ${tenant.name}, this is a reminder that your rent of ${inr(tenant.rentAmount)} for ${pgName} is due. Please arrange payment at your earliest convenience. Thank you!`;

  function agreementMessage() {
    if (!currentAgreement) return "";
    const facilitiesText = ((currentAgreement.facilities as { name: string; amount: number }[]) || [])
      .map((f) => `${f.name}: ${inr(f.amount)}`)
      .join(", ");
    return [
      `Hi ${tenant.name}, here are your PG terms for ${pgName} (version ${currentAgreement.version}, effective ${fmtDate(currentAgreement.effectiveDate)}):`,
      `Room: ${currentAgreement.roomNumber || tenant.roomNumber || "—"}`,
      `Monthly rent: ${inr(tenant.rentAmount)}`,
      `Security deposit: ${inr(tenant.depositAmount)} (${currentAgreement.depositRefundable ? "refundable" : "non-refundable"})`,
      `Electricity: ${inr(currentAgreement.electricityRate)} per unit`,
      `Laundry: ${currentAgreement.laundryChargeable ? inr(currentAgreement.laundryCharge) + " per month" : "Included"}`,
      facilitiesText ? `Other facilities: ${facilitiesText}` : null,
      currentAgreement.note ? `Note: ${currentAgreement.note}` : null,
      `Please reach out with any questions. Thank you!`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  async function handleDelete() {
    await deleteTenant(manager, tenant.id);
    toast.success("Tenant deleted");
    router.push("/tenants");
  }

  async function handleDeleteReading(id: string) {
    await deleteElectricityBill(manager, id, tenant.id);
    toast.success("Reading deleted");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="mb-4 flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={tenant.photoUrl ?? undefined} />
              <AvatarFallback>{tenant.name.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <p className="text-lg font-semibold">{tenant.name}</p>
              <p className="text-sm text-muted-foreground">
                Room {tenant.roomNumber || "—"} · Bed {tenant.bedNumber || "—"}
              </p>
              <p className="text-xs text-muted-foreground">{tenant.phone} · {tenant.email}</p>
            </div>
            {tenant.status === "VACATED" && <Badge variant="destructive">Vacated</Badge>}
          </div>

          {tenant.status === "VACATED" && tenant.refundAmount !== null && (
            <div className="mb-4 rounded-lg bg-amber-100 p-3 dark:bg-amber-950">
              <p className="text-xs font-semibold">Checked out {fmtDate(tenant.vacatedDate)}</p>
              {tenant.checkoutDeductions.length > 0 && (
                <p className="mt-1 text-xs">
                  Deductions: {tenant.checkoutDeductions.map((d) => `${d.reason} (${inr(d.amount)})`).join(", ")}
                </p>
              )}
              <p className={`mt-1 text-sm font-bold ${Number(tenant.refundAmount) < 0 ? "text-destructive" : ""}`}>
                {Number(tenant.refundAmount) >= 0 ? "Refunded" : "Owed by tenant"}: {inr(Math.abs(Number(tenant.refundAmount)))} via{" "}
                {tenant.refundMethod === "CHEQUE" ? "cheque" : "cash"}
              </p>
            </div>
          )}

          <div className="mb-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Monthly rent</p>
              <p className="font-semibold">{inr(tenant.rentAmount)}</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Total collected</p>
              <p className="font-semibold text-primary">{inr(totalPaid)}</p>
            </div>
          </div>

          <div className="mb-4 space-y-1.5 text-sm">
            {tenant.pan && (
              <p className="flex items-center gap-2">
                <CreditCard className="h-3.5 w-3.5 text-muted-foreground" /> PAN: {tenant.pan}
              </p>
            )}
            {tenant.idProofNumber && (
              <p className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" /> {tenant.idProofType}: {tenant.idProofNumber}
              </p>
            )}
            {tenant.carNumber && (
              <p className="flex items-center gap-2">
                <Car className="h-3.5 w-3.5 text-muted-foreground" /> {tenant.carNumber} {tenant.carModel && `· ${tenant.carModel}`}
              </p>
            )}
            {tenant.address && (
              <p className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" /> {tenant.address}
              </p>
            )}
            {tenant.emergencyPhone && (
              <p className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" /> Emergency: {tenant.emergencyContact} ({tenant.emergencyPhone})
              </p>
            )}
            <p className="pt-1 text-xs text-muted-foreground">
              Joined {fmtDate(tenant.joinDate)} · Onboarded by {tenant.createdBy}
            </p>
          </div>

          {(tenant.aadhaarFrontUrl || tenant.aadhaarBackUrl) && (
            <div className="mb-4 flex gap-2">
              {tenant.aadhaarFrontUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={tenant.aadhaarFrontUrl} alt="Aadhaar front" className="h-16 w-24 rounded border object-cover" />
              )}
              {tenant.aadhaarBackUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={tenant.aadhaarBackUrl} alt="Aadhaar back" className="h-16 w-24 rounded border object-cover" />
              )}
            </div>
          )}

          <div className="mb-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setPayOpen(true)}>
              <IndianRupee className="h-3.5 w-3.5" /> Record payment
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setElectricityOpen(true)}>
              <Zap className="h-3.5 w-3.5" /> Meter reading
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setRemOpen(true)}>
              <BellRing className="h-3.5 w-3.5" /> Add reminder
            </Button>
            {tenant.phone && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShareMsg({ title: "Send rent reminder", subject: "Rent reminder", message: reminderMsg })}
              >
                <MessageCircle className="h-3.5 w-3.5" /> Send reminder
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3.5 w-3.5" /> Edit details
            </Button>
            {tenant.status === "ACTIVE" && (
              <Button size="sm" variant="outline" onClick={() => setCheckoutOpen(true)}>
                <LogOut className="h-3.5 w-3.5" /> Checkout tenant
              </Button>
            )}
            <Button size="sm" variant="destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          </div>

          {currentAgreement && (
            <div className="mb-4 rounded-lg border bg-muted/30 p-3">
              <p className="flex items-center gap-1 text-sm font-semibold">
                <FileText className="h-3.5 w-3.5" /> Onboarding agreement · v{currentAgreement.version}
              </p>
              <p className="text-xs text-muted-foreground">Effective {fmtDate(currentAgreement.effectiveDate)}</p>
              <div className="mt-1 space-y-0.5 text-xs">
                <p>
                  Deposit: {inr(tenant.depositAmount)} ({currentAgreement.depositRefundable ? "refundable" : "non-refundable"}) ·{" "}
                  taken as {tenant.depositMethod === "CHEQUE" ? "blank cheque" : "cash"}
                </p>
                <p>
                  Electricity: {inr(currentAgreement.electricityRate)}/unit · Laundry:{" "}
                  {currentAgreement.laundryChargeable ? `${inr(currentAgreement.laundryCharge)}/month` : "Included"}
                </p>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setAgreementOpen(true)}>
                  <Pencil className="h-3 w-3" /> Revise agreement
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShareMsg({ title: "Share agreement", subject: "Your PG agreement", message: agreementMessage() })}
                >
                  <MessageCircle className="h-3 w-3" /> Share agreement
                </Button>
                {tenant.agreements.length > 1 && (
                  <Button size="sm" variant="outline" onClick={() => setHistoryOpen(true)}>
                    <History className="h-3 w-3" /> History ({tenant.agreements.length - 1})
                  </Button>
                )}
              </div>
            </div>
          )}

          {tenant.reminders.length > 0 && (
            <div className="mb-4">
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-amber-700">Pending reminders</p>
              {tenant.reminders.map((r) => (
                <p key={r.id} className="text-sm">
                  • {r.title} — due {fmtDate(r.dueDate)}
                </p>
              ))}
            </div>
          )}

          {tenant.electricityBills.length > 0 && (
            <div className="mb-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-700">Electricity readings</p>
              <div className="space-y-2">
                {tenant.electricityBills.map((b) => (
                  <div key={b.id} className="flex items-center justify-between rounded-lg border p-2 text-sm">
                    <div className="flex items-center gap-2">
                      {b.photoUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={b.photoUrl} alt="" className="h-8 w-8 rounded object-cover" />
                      )}
                      <span>
                        {fmtDate(b.startDate)} → {fmtDate(b.endDate)} · {Number(b.units)} units
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold">{inr(b.amount)}</span>
                      <button onClick={() => handleDeleteReading(b.id)} className="text-xs text-destructive">
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-700">Ledger history</p>
          <div className="space-y-2 border-l-2 border-dashed pl-4">
            {tenant.ledgerEntries.length === 0 && <p className="text-sm text-muted-foreground">No payments recorded yet.</p>}
            {tenant.ledgerEntries.map((t) => (
              <div key={t.id}>
                <p className="text-sm font-medium">
                  {inr(t.amount)} · <span className="font-normal capitalize text-muted-foreground">{t.type.toLowerCase()}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {fmtDate(t.date)} · {t.mode.replace("_", " ")} · by {t.recordedBy}
                  {t.note ? ` · ${t.note}` : ""}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <TenantFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        initial={{ ...tenant, rentAmount: Number(tenant.rentAmount), depositAmount: Number(tenant.depositAmount), joinDate: tenant.joinDate.toISOString().slice(0, 10) } as never}
      />
      <CheckoutDialog open={checkoutOpen} onOpenChange={setCheckoutOpen} tenant={tenant} />
      <LedgerFormDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        tenants={[tenant]}
        fixedTenantId={tenant.id}
        defaultAmount={Number(tenant.rentAmount)}
      />
      <ReminderFormDialog
        open={remOpen}
        onOpenChange={setRemOpen}
        tenants={[tenant]}
        fixedTenantId={tenant.id}
        defaultAmount={Number(tenant.rentAmount)}
      />
      <MeterReadingDialog
        key={electricityOpen ? "open" : "closed"}
        open={electricityOpen}
        onOpenChange={setElectricityOpen}
        tenantId={tenant.id}
        defaultRate={electricityRate}
        lastReading={
          tenant.electricityBills[0]
            ? {
                endReading: Number(tenant.electricityBills[0].endReading),
                endDate: tenant.electricityBills[0].endDate.toISOString(),
              }
            : null
        }
      />
      {currentAgreement && (
        <AgreementFormDialog open={agreementOpen} onOpenChange={setAgreementOpen} tenantId={tenant.id} current={currentAgreement} />
      )}
      {shareMsg && (
        <SendMessageDialog
          open={!!shareMsg}
          onOpenChange={(o) => !o && setShareMsg(null)}
          title={shareMsg.title}
          subject={shareMsg.subject}
          message={shareMsg.message}
          phone={tenant.phone}
          email={tenant.email}
          defaultLink={paymentLink}
        />
      )}

      {historyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setHistoryOpen(false)}>
          <Card className="max-h-[80vh] w-full max-w-md overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <CardContent className="space-y-3 p-4">
              <p className="text-lg font-semibold">Agreement history</p>
              {tenant.agreements.slice(1).map((h) => (
                <div key={h.id} className="rounded-lg border bg-muted/30 p-3 text-xs">
                  <p className="font-semibold">v{h.version} · effective {fmtDate(h.effectiveDate)}</p>
                  <p className="text-muted-foreground">
                    Rent {inr(h.rentAmount)} · Deposit {inr(h.depositAmount)} · Electricity {inr(h.electricityRate)}/unit
                  </p>
                  {h.changeNote && <p className="mt-1">Reason: {h.changeNote}</p>}
                  <p className="mt-1 text-muted-foreground">
                    Changed by {h.changedBy} on {fmtDate(h.createdAt)}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setConfirmDelete(false)}>
          <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <CardContent className="space-y-4 p-5">
              <p className="text-lg font-semibold">Delete tenant permanently?</p>
              <p className="text-sm text-muted-foreground">
                This removes {tenant.name} entirely. Consider checkout instead if you want to keep records.
              </p>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
                <Button variant="destructive" className="flex-1" onClick={handleDelete}>
                  Confirm
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
