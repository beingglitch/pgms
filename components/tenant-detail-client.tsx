"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  CalendarClock,
  Receipt as ReceiptIcon,
} from "lucide-react";
import { Amount, KhataRow, Panel, SectionHeading } from "@/components/khata";
import { inr, fmtDate, paymentMethodLabel, todayISO } from "@/lib/format";
import { CHARGE_TYPE_LABELS, chargeOutstanding, chargePaid, summariseCharges } from "@/lib/charges";
import { type Signature } from "@/lib/messages";
import { deleteTenant, getTenant, giveNotice, cancelNotice } from "@/app/actions/tenants";
import { deleteElectricityBill } from "@/app/actions/electricity";
import { useManager } from "@/lib/manager-context";
import { TenantFormDialog } from "@/components/tenant-form-dialog";
import { CheckoutDialog } from "@/components/checkout-dialog";
import { LedgerFormDialog } from "@/components/ledger-form-dialog";
import { ReminderFormDialog } from "@/components/reminder-form-dialog";
import { AgreementFormDialog } from "@/components/agreement-form-dialog";
import { ChargeFormDialog } from "@/components/charge-form-dialog";
import { MeterReadingDialog } from "@/components/meter-reading-dialog";
import { SendMessageDialog } from "@/components/send-message-dialog";
import { SendDuesReminderDialog } from "@/components/send-dues-reminder-dialog";
import { toast } from "sonner";

type TenantDetail = NonNullable<Awaited<ReturnType<typeof getTenant>>>;

export function TenantDetailClient({
  tenant,
  paymentLink,
  signature,
  electricityRate,
}: {
  tenant: TenantDetail;
  paymentLink: string;
  signature: Signature;
  electricityRate: number;
}) {
  const router = useRouter();
  const { manager } = useManager();
  const [editOpen, setEditOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [remOpen, setRemOpen] = useState(false);
  const [chargeOpen, setChargeOpen] = useState(false);
  const [agreementOpen, setAgreementOpen] = useState(false);
  const [electricityOpen, setElectricityOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [shareMsg, setShareMsg] = useState<{ title: string; subject: string; message: string } | null>(null);
  const [duesReminderOpen, setDuesReminderOpen] = useState(false);

  const currentAgreement = tenant.agreements[0];
  const summary = summariseCharges(tenant.charges);
  const openCharges = tenant.charges.filter((c) => chargeOutstanding(c) > 0.005);
  const roomLabel = tenant.room ? `${tenant.room.floor.name} · Room ${tenant.room.number}` : tenant.roomNumber;

  function agreementMessage() {
    if (!currentAgreement) return "";
    const facilitiesText = ((currentAgreement.facilities as { name: string; amount: number }[]) || [])
      .map((f) => `${f.name}: ${inr(f.amount)}`)
      .join(", ");
    return [
      `Hi ${tenant.name}, here are your terms for ${signature.pgName} (version ${currentAgreement.version}, effective ${fmtDate(currentAgreement.effectiveDate)}):`,
      `Room: ${currentAgreement.roomNumber || tenant.roomNumber || "not assigned"}`,
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
      <Panel>
        <div className="mb-4 flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src={tenant.photoUrl ?? undefined} />
            <AvatarFallback className="font-display text-lg">{tenant.name.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-lg font-semibold tracking-tight">{tenant.name}</p>
            <p className="text-sm text-muted-foreground">{roomLabel || "No room assigned"}</p>
            <p className="truncate text-xs text-muted-foreground">
              {tenant.phone}
              {tenant.email ? ` · ${tenant.email}` : ""}
            </p>
          </div>
          {tenant.status === "VACATED" && <Badge variant="destructive">Vacated</Badge>}
        </div>

        {tenant.status === "ACTIVE" && tenant.expectedVacateDate && (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-marigold/40 bg-marigold/5 p-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-marigold-foreground">Giving notice</p>
              <p className="text-sm">
                Leaving by <strong>{fmtDate(tenant.expectedVacateDate)}</strong>
              </p>
            </div>
            <button
              onClick={async () => {
                await cancelNotice(manager, tenant.id);
                toast.success("Notice withdrawn");
                router.refresh();
              }}
              className="text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              Withdraw
            </button>
          </div>
        )}

        {tenant.status === "VACATED" && tenant.refundAmount !== null && (
          <div className="mb-4 rounded-xl border border-border bg-muted/40 p-3">
            <p className="text-xs font-semibold text-muted-foreground">Checked out {fmtDate(tenant.vacatedDate)}</p>
            {tenant.checkoutDeductions.length > 0 && (
              <p className="mt-1 text-xs">
                Deductions: {tenant.checkoutDeductions.map((d) => `${d.reason} (${inr(d.amount)})`).join(", ")}
              </p>
            )}
            <p className={`mt-1 text-sm font-bold ${Number(tenant.refundAmount) < 0 ? "text-ledger" : "text-positive"}`}>
              {Number(tenant.refundAmount) >= 0 ? "Refunded" : "Owed by tenant"}: {inr(Math.abs(Number(tenant.refundAmount)))}{" "}
              via {paymentMethodLabel(tenant.refundMethod)}
            </p>
          </div>
        )}

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">Monthly rent</p>
            <Amount value={tenant.rentAmount} size="lg" />
          </div>
          <div className="rounded-xl border border-border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">Outstanding</p>
            <Amount value={summary.total.outstanding} tone={summary.total.outstanding > 0.005 ? "owed" : "positive"} size="lg" />
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
              <Phone className="h-3.5 w-3.5 text-muted-foreground" /> Emergency: {tenant.emergencyContact} (
              {tenant.emergencyPhone})
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
              <img src={tenant.aadhaarFrontUrl} alt="Aadhaar front" className="h-16 w-24 rounded-lg border border-border object-cover" />
            )}
            {tenant.aadhaarBackUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tenant.aadhaarBackUrl} alt="Aadhaar back" className="h-16 w-24 rounded-lg border border-border object-cover" />
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
          <Button size="sm" variant="secondary" onClick={() => setChargeOpen(true)}>
            <ReceiptIcon className="h-3.5 w-3.5" /> Add charge
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setRemOpen(true)}>
            <BellRing className="h-3.5 w-3.5" /> Add reminder
          </Button>
          {openCharges.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setDuesReminderOpen(true)}>
              <MessageCircle className="h-3.5 w-3.5" /> Send dues
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3.5 w-3.5" /> Edit details
          </Button>
          {tenant.status === "ACTIVE" && !tenant.expectedVacateDate && (
            <Button size="sm" variant="outline" onClick={() => setNoticeOpen(true)}>
              <CalendarClock className="h-3.5 w-3.5" /> Give notice
            </Button>
          )}
          {tenant.status === "ACTIVE" && (
            <Button size="sm" variant="outline" onClick={() => setCheckoutOpen(true)}>
              <LogOut className="h-3.5 w-3.5" /> Checkout
            </Button>
          )}
          <Button size="sm" variant="destructive" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        </div>

        {currentAgreement && (
          <div className="mb-4 rounded-xl border border-border bg-muted/30 p-3">
            <p className="flex items-center gap-1 text-sm font-semibold">
              <FileText className="h-3.5 w-3.5" /> Onboarding agreement · v{currentAgreement.version}
            </p>
            <p className="text-xs text-muted-foreground">Effective {fmtDate(currentAgreement.effectiveDate)}</p>
            <div className="mt-1 space-y-0.5 text-xs">
              <p>
                Deposit: {inr(tenant.depositAmount)} ({currentAgreement.depositRefundable ? "refundable" : "non-refundable"}) ·{" "}
                taken as {tenant.depositMethod === "CHEQUE" ? "blank cheque" : paymentMethodLabel(tenant.depositMethod)}
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

        {openCharges.length > 0 && (
          <div className="mb-4">
            <SectionHeading>Open charges</SectionHeading>
            {openCharges.map((c) => {
              const outstanding = chargeOutstanding(c);
              const paid = chargePaid(c);
              const late = new Date(c.dueDate).toISOString().slice(0, 10) < todayISO();
              return (
                <KhataRow
                  key={c.id}
                  className="py-2"
                  amount={
                    <div className="text-right">
                      <Amount value={outstanding} tone="owed" size="sm" />
                      {paid > 0 && <p className="text-[11px] text-muted-foreground">{inr(paid)} paid</p>}
                    </div>
                  }
                >
                  <p className="truncate text-sm">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                      {CHARGE_TYPE_LABELS[c.type]}
                    </span>{" "}
                    {c.description}
                  </p>
                  <p className={`text-[11px] ${late ? "font-semibold text-ledger" : "text-muted-foreground"}`}>
                    {late ? "Overdue since" : "Due"} {fmtDate(c.dueDate)}
                  </p>
                </KhataRow>
              );
            })}
          </div>
        )}

        {tenant.reminders.length > 0 && (
          <div className="mb-4">
            <SectionHeading>Pending reminders</SectionHeading>
            {tenant.reminders.map((r) => (
              <p key={r.id} className="text-sm">
                • {r.title}, due {fmtDate(r.dueDate)}
              </p>
            ))}
          </div>
        )}

        {tenant.electricityBills.length > 0 && (
          <div className="mb-4">
            <SectionHeading>Electricity readings</SectionHeading>
            <div className="space-y-2">
              {tenant.electricityBills.map((b) => (
                <div key={b.id} className="flex items-center justify-between rounded-lg border border-border p-2 text-sm">
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
                    <Amount value={b.amount} size="sm" />
                    <button onClick={() => handleDeleteReading(b.id)} className="text-xs text-destructive">
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <SectionHeading>Ledger history</SectionHeading>
        <div className="space-y-2 border-l-2 border-dashed border-border pl-4">
          {tenant.ledgerEntries.length === 0 && <p className="text-sm text-muted-foreground">No payments recorded yet.</p>}
          {tenant.ledgerEntries.map((t) => (
            <div key={t.id}>
              <p className="text-sm font-medium">
                {inr(t.amount)} · <span className="font-normal capitalize text-muted-foreground">{t.type.toLowerCase()}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {fmtDate(t.date)} · {t.mode.replace("_", " ")} · by {t.recordedBy}
                {t.note ? ` · ${t.note}` : ""}
                {t.receiptNo ? <span className="serial"> · {t.receiptNo}</span> : null}
              </p>
            </div>
          ))}
        </div>
      </Panel>

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
      <ChargeFormDialog open={chargeOpen} onOpenChange={setChargeOpen} tenantId={tenant.id} tenantName={tenant.name} />
      <MeterReadingDialog
        key={electricityOpen ? "open" : "closed"}
        open={electricityOpen}
        onOpenChange={setElectricityOpen}
        tenantId={tenant.roomId ? undefined : tenant.id}
        roomId={tenant.roomId ?? undefined}
        occupants={tenant.roomId ? [{ id: tenant.id, name: tenant.name }] : undefined}
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
      {duesReminderOpen && (
        <SendDuesReminderDialog
          open={duesReminderOpen}
          onOpenChange={(o) => {
            setDuesReminderOpen(o);
            if (!o) router.refresh();
          }}
          tenantId={tenant.id}
          tenantName={tenant.name}
          roomLabel={roomLabel}
          phone={tenant.phone}
          email={tenant.email}
          signature={signature}
          paymentLink={paymentLink}
        />
      )}

      <NoticeDialog
        open={noticeOpen}
        onOpenChange={setNoticeOpen}
        tenantId={tenant.id}
        manager={manager}
        onDone={() => router.refresh()}
      />

      {historyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setHistoryOpen(false)}>
          <div
            className="max-h-[80vh] w-full max-w-md space-y-3 overflow-y-auto rounded-2xl border border-border bg-background p-4 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-display text-lg font-semibold">Agreement history</p>
            {tenant.agreements.slice(1).map((h) => (
              <div key={h.id} className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
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
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setConfirmDelete(false)}>
          <div
            className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-background p-4 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
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
          </div>
        </div>
      )}
    </div>
  );
}

function NoticeDialog({
  open,
  onOpenChange,
  tenantId,
  manager,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  manager: string;
  onDone: () => void;
}) {
  const [noticeDate, setNoticeDate] = useState(todayISO());
  const [vacateDate, setVacateDate] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!vacateDate) return toast.error("Pick the date they expect to leave.");
    setBusy(true);
    await giveNotice(manager, tenantId, { noticeDate, expectedVacateDate: vacateDate });
    setBusy(false);
    toast.success("Notice recorded");
    onOpenChange(false);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record notice to vacate</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="mb-1.5">Notice given on</Label>
            <Input type="date" value={noticeDate} onChange={(e) => setNoticeDate(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1.5">Expected to leave by</Label>
            <Input type="date" value={vacateDate} onChange={(e) => setVacateDate(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">
            Shows up on the dashboard as an upcoming vacancy so you can plan the next tenant and the deposit refund.
          </p>
          <Button onClick={save} disabled={busy} className="w-full">
            Save notice
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

