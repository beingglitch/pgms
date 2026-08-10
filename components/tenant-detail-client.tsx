"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  ChevronDown,
  ChevronRight,
  MessageCircle,
  Pencil,
  LogOut,
  Trash2,
  FileText,
  CreditCard,
  Car,
  MapPin,
  Phone,
  Receipt as ReceiptIcon,
} from "lucide-react";
import { Amount, KhataRow, Panel, SectionHeading } from "@/components/khata";
import { BackButton } from "@/components/back-button";
import { inr, fmtDate, dateISO, paymentMethodLabel, todayISO } from "@/lib/format";
import { CHARGE_TYPE_LABELS, chargeOutstanding, chargePaid, num, summariseCharges } from "@/lib/charges";
import { type Signature } from "@/lib/messages";
import { deleteTenant, getTenant, cancelNotice } from "@/app/actions/tenants";
import { deleteElectricityBill } from "@/app/actions/electricity";
import { useManager } from "@/lib/manager-context";
import { TenantFormDialog } from "@/components/tenant-form-dialog";
import { CheckoutDialog } from "@/components/checkout-dialog";
import { ChargeFormDialog } from "@/components/charge-form-dialog";
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
  const [chargeOpen, setChargeOpen] = useState(false);
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
      <BackButton fallbackHref="/tenants" />
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
              <img src={tenant.aadhaarFrontUrl} alt={`${tenant.idProofType} front`} className="h-16 w-24 rounded-lg border border-border object-cover" />
            )}
            {tenant.aadhaarBackUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tenant.aadhaarBackUrl} alt={`${tenant.idProofType} back`} className="h-16 w-24 rounded-lg border border-border object-cover" />
            )}
          </div>
        )}

        <div className="mb-4 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => setChargeOpen(true)}>
            <ReceiptIcon className="h-3.5 w-3.5" /> Add charge
          </Button>
          {openCharges.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setDuesReminderOpen(true)}>
              <MessageCircle className="h-3.5 w-3.5" /> Send dues
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3.5 w-3.5" /> Edit details
          </Button>
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
              <FileText className="h-3.5 w-3.5" /> Onboarding agreement
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
            <p className="mt-1 text-xs text-muted-foreground">
              Change any of these from Edit details below, no separate revision.
            </p>
            <div className="mt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShareMsg({ title: "Share agreement", subject: "Your PG agreement", message: agreementMessage() })}
              >
                <MessageCircle className="h-3 w-3" /> Share agreement
              </Button>
            </div>
          </div>
        )}

        {openCharges.length > 0 && (
          <div className="mb-4">
            <SectionHeading>Open charges</SectionHeading>
            {Object.entries(
              openCharges.reduce<Record<string, typeof openCharges>>((groups, c) => {
                const key = dateISO(c.dueDate);
                (groups[key] ??= []).push(c);
                return groups;
              }, {})
            )
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([dueDate, charges]) => <ChargeDueGroup key={dueDate} dueDate={dueDate} charges={charges} />)}
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
        electricityRatePerUnit={electricityRate}
        currentAgreement={
          currentAgreement
            ? {
                electricityRate: Number(currentAgreement.electricityRate),
                facilities: (currentAgreement.facilities as { name: string; amount: number }[]) || [],
                depositRefundable: currentAgreement.depositRefundable,
                laundryChargeable: currentAgreement.laundryChargeable,
                laundryCharge: Number(currentAgreement.laundryCharge),
                note: currentAgreement.note || "",
                photoUrl: currentAgreement.photoUrl || "",
              }
            : null
        }
      />
      <CheckoutDialog open={checkoutOpen} onOpenChange={setCheckoutOpen} tenant={tenant} />
      <ChargeFormDialog
        open={chargeOpen}
        onOpenChange={setChargeOpen}
        tenantId={tenant.id}
        tenantName={tenant.name}
        roomId={tenant.roomId}
      />
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
          roomId={tenant.roomId}
          phone={tenant.phone}
          email={tenant.email}
          signature={signature}
          paymentLink={paymentLink}
        />
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

type ChargeRow = TenantDetail["charges"][number];

/**
 * One row per due date, collapsed to the cumulative total (it's usually all
 * of a cycle's charges landing the same day, rent plus whatever else), with
 * the individual charges available a click away instead of cluttering the
 * default view.
 */
function ChargeDueGroup({ dueDate, charges }: { dueDate: string; charges: ChargeRow[] }) {
  const [open, setOpen] = useState(false);
  const late = dueDate < todayISO();
  const totalOutstanding = charges.reduce((s, c) => s + chargeOutstanding(c), 0);
  const totalPaid = charges.reduce((s, c) => s + chargePaid(c), 0);

  return (
    <div className="border-b border-border/70 last:border-b-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 py-2.5 text-left"
      >
        <span className="flex items-center gap-1.5 text-sm">
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className={late ? "font-semibold text-ledger" : ""}>
            {late ? "Overdue since" : "Due"} {fmtDate(dueDate)}
          </span>
          <span className="text-xs text-muted-foreground">
            ({charges.length} charge{charges.length === 1 ? "" : "s"})
          </span>
        </span>
        <Amount value={totalOutstanding} tone="owed" size="sm" />
      </button>

      {open && (
        <div className="pb-2.5 pl-5">
          {charges.map((c) => (
            <KhataRow key={c.id} className="py-1.5" amount={<Amount value={num(c.amount)} tone="owed" size="sm" />}>
              <p className="truncate text-sm">
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  {CHARGE_TYPE_LABELS[c.type]}
                </span>{" "}
                {c.description}
              </p>
            </KhataRow>
          ))}
          {totalPaid > 0 && (
            <KhataRow className="py-1.5" amount={<span className="khata-amount text-sm text-positive">− {inr(totalPaid)}</span>}>
              <p className="text-xs font-semibold text-positive">Partially paid</p>
            </KhataRow>
          )}
        </div>
      )}
    </div>
  );
}

