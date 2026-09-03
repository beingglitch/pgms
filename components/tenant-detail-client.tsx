"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bar, BarChart, Cell, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ZoomableAvatar, ZoomableImage } from "@/components/image-viewer";
import {
  ChevronDown,
  ChevronRight,
  MessageCircle,
  Pencil,
  LogOut,
  MoreHorizontal,
  Trash2,
  FileText,
  CreditCard,
  Car,
  MapPin,
  Phone,
  Wallet,
  Receipt as ReceiptIcon,
} from "lucide-react";
import { Amount, Panel, SectionHeading } from "@/components/khata";
import { BackButton } from "@/components/back-button";
import { TenantPdfActions } from "@/components/tenant-pdf-actions";
import { inr, fmtDate, dateISO, paymentMethodLabel, todayISO } from "@/lib/format";
import { CHARGE_TYPE_LABELS, chargeOutstanding, chargePaid, coveredPeriodsLabel, num, periodLabel, periodOf, summariseCharges } from "@/lib/charges";
import { buildStatement, type Statement, type StatementLine, type StatementMonth } from "@/lib/statement";
import { type Signature } from "@/lib/messages";
import { deleteTenant, cancelNotice, setTenantImage } from "@/app/actions/tenants";
import { deleteElectricityBill, setMeterPhoto } from "@/app/actions/electricity";
import { useManager } from "@/lib/manager-context";
import { TenantFormDialog } from "@/components/tenant-form-dialog";
import { CheckoutDialog } from "@/components/checkout-dialog";
import { ChargeFormDialog } from "@/components/charge-form-dialog";
import { LedgerFormDialog } from "@/components/ledger-form-dialog";
import { AdjustChargeDialog } from "@/components/adjust-charge-dialog";
import { SendMessageDialog } from "@/components/send-message-dialog";
import { SendDuesReminderDialog } from "@/components/send-dues-reminder-dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { SerialisedTenant } from "@/app/(app)/tenants/[id]/page";
import type { listRoomOptions } from "@/app/actions/rooms";

type TenantDetail = SerialisedTenant;

/** The one charge a "Pay" button is settling; drives the pinned payment dialog. */
type PayTarget = { id: string; label: string; type: StatementLine["type"]; outstanding: number };
/** The one charge an "Edit" button is settling for a different amount. */
type AdjustTarget = { id: string; description: string; amount: number; paid: number };

const STATUS_BADGE: Record<StatementMonth["status"], { label: string; className: string }> = {
  clear: { label: "Clear", className: "bg-secondary text-primary" },
  partial: { label: "Partial", className: "bg-marigold/15 text-marigold-foreground" },
  unpaid: { label: "Unpaid", className: "bg-ledger/10 text-ledger" },
  none: { label: "Nothing billed", className: "bg-muted text-muted-foreground" },
};

export function TenantDetailClient({
  tenant,
  paymentLink,
  signature,
  electricityRate,
  roomOptions,
}: {
  tenant: TenantDetail;
  paymentLink: string;
  signature: Signature;
  electricityRate: number;
  roomOptions: Awaited<ReturnType<typeof listRoomOptions>>;
}) {
  const router = useRouter();
  const { manager } = useManager();
  const [editOpen, setEditOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [chargeOpen, setChargeOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [shareMsg, setShareMsg] = useState<{ title: string; subject: string; message: string } | null>(null);
  const [duesReminderOpen, setDuesReminderOpen] = useState(false);

  // Change/Delete from inside the image viewer, for the tenant's own photos.
  function imageActions(field: "photoUrl" | "aadhaarFrontUrl" | "aadhaarBackUrl") {
    return {
      onChange: async (url: string) => {
        await setTenantImage(manager, tenant.id, field, url);
        router.refresh();
      },
      onDelete: async () => {
        await setTenantImage(manager, tenant.id, field, null);
        router.refresh();
      },
    };
  }
  function meterPhotoActions(billId: string) {
    return {
      onChange: async (url: string) => {
        await setMeterPhoto(manager, billId, url);
        router.refresh();
      },
      onDelete: async () => {
        await setMeterPhoto(manager, billId, null);
        router.refresh();
      },
    };
  }
  const [paying, setPaying] = useState<PayTarget | null>(null);
  const [adjusting, setAdjusting] = useState<AdjustTarget | null>(null);

  const currentAgreement = tenant.agreements[0];
  const summary = summariseCharges(tenant.charges);
  const openCharges = tenant.charges.filter((c) => chargeOutstanding(c) > 0.005);
  const roomLabel = tenant.room ? `${tenant.room.floor.name} · Room ${tenant.room.number}` : tenant.roomNumber;
  const owedNow = summary.total.outstanding;
  const statement = useMemo(() => buildStatement(tenant), [tenant]);

  function payCharge(c: { id: string; type: StatementLine["type"]; description: string }, outstanding: number) {
    setPaying({ id: c.id, type: c.type, label: c.description, outstanding });
  }

  function adjustCharge(c: { id: string; description: string; amount: number; paid: number }) {
    setAdjusting({ id: c.id, description: c.description, amount: c.amount, paid: c.paid });
  }

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
    <div className="space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <BackButton fallbackHref="/tenants" />
      </div>

      <Panel>
        {/* 1. Identity row */}
        <div className="mb-4 flex items-center gap-4">
          <ZoomableAvatar
            src={tenant.photoUrl}
            name={tenant.name}
            className="h-[52px] w-[52px] rounded-[18px] bg-primary [&_[data-slot=avatar-fallback]]:rounded-[18px] [&_[data-slot=avatar-fallback]]:bg-primary [&_[data-slot=avatar-fallback]]:text-primary-foreground [&_[data-slot=avatar-image]]:rounded-[18px]"
            fallbackClassName="font-display text-[17px] font-bold"
            downloadName={`${tenant.name}-photo.jpg`}
            {...imageActions("photoUrl")}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[20px] font-bold tracking-tight">{tenant.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {roomLabel || "No room assigned"}
              {tenant.bedNumber ? ` · bed ${tenant.bedNumber}` : ""} · {inr(tenant.rentAmount)}/mo · since{" "}
              {fmtDate(tenant.joinDate)}
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

        {/* 2. Owed now */}
        <div className="mb-4 rounded-[18px] border border-l-[3px] border-border border-l-ledger bg-background p-3.5">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Owed now</p>
          <p
            className="khata-amount mt-0.5 text-[30px] font-bold leading-none"
            style={{ color: owedNow > 0.005 ? "var(--ledger)" : "var(--positive)" }}
          >
            {inr(owedNow)}
          </p>
          {openCharges.length > 0 ? (
            <div className="mt-3 border-t border-border/70">
              {openCharges.map((c) => {
                const late = dateISO(c.dueDate) < todayISO();
                const daysLate = late
                  ? Math.round((new Date(todayISO()).getTime() - new Date(dateISO(c.dueDate)).getTime()) / 86400000)
                  : 0;
                const outstanding = chargeOutstanding(c);
                return (
                  <div key={c.id} className="flex items-center justify-between gap-3 border-b border-border/50 py-2 last:border-b-0">
                    <p className="min-w-0 text-[12.5px] leading-snug">
                      <span className="font-semibold">{CHARGE_TYPE_LABELS[c.type]}</span>{" "}
                      <span className="text-muted-foreground">
                        · {c.description}
                        {late ? ` · ${daysLate} day${daysLate === 1 ? "" : "s"} late` : ""}
                      </span>
                    </p>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="khata-amount text-[12.5px] font-bold text-ledger">{inr(outstanding)}</span>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => adjustCharge({ id: c.id, description: c.description, amount: num(c.amount), paid: chargePaid(c) })}
                        title="Settle for a different amount"
                      >
                        Edit
                      </Button>
                      <Button size="xs" variant="outline" onClick={() => payCharge(c, outstanding)}>
                        Pay
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">Nothing outstanding.</p>
          )}
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
          <p className="pt-1 text-xs text-muted-foreground">Onboarded by {tenant.createdBy}</p>
        </div>

        {(tenant.aadhaarFrontUrl || tenant.aadhaarBackUrl) && (
          <div className="mb-4 flex gap-2">
            {tenant.aadhaarFrontUrl && (
              <ZoomableImage
                src={tenant.aadhaarFrontUrl}
                alt={`${tenant.idProofType} front`}
                downloadName={`${tenant.name}-${tenant.idProofType}-front.jpg`}
                thumbClassName="h-16 w-24 rounded-lg border border-border object-cover"
                {...imageActions("aadhaarFrontUrl")}
              />
            )}
            {tenant.aadhaarBackUrl && (
              <ZoomableImage
                src={tenant.aadhaarBackUrl}
                alt={`${tenant.idProofType} back`}
                downloadName={`${tenant.name}-${tenant.idProofType}-back.jpg`}
                thumbClassName="h-16 w-24 rounded-lg border border-border object-cover"
                {...imageActions("aadhaarBackUrl")}
              />
            )}
          </div>
        )}

        <div className="mb-4 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => setChargeOpen(true)}>
            <ReceiptIcon className="h-3.5 w-3.5" /> Add charge
          </Button>
          {currentAgreement && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShareMsg({ title: "Share agreement", subject: "Your PG agreement", message: agreementMessage() })}
            >
              <MessageCircle className="h-3 w-3" /> Share agreement
            </Button>
          )}
          <TenantPdfActions tenantId={tenant.id} tenantName={tenant.name} />
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
              Change any of these from Edit details, no separate revision.
            </p>
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
            <p className="-mt-1 mb-2 text-[11.5px] text-muted-foreground">
              Every reading of this room&apos;s meter, including ones closed before they moved in.
            </p>
            <div className="space-y-2">
              {tenant.electricityBills.map((b) => {
                const open = !b.endDate;
                return (
                  <div key={b.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-2 text-sm">
                    <div className="flex min-w-0 items-center gap-2">
                      {b.photoUrl && (
                        <ZoomableImage
                          src={b.photoUrl}
                          alt="Meter reading proof"
                          downloadName={`${tenant.name}-meter-${dateISO(b.startDate)}.jpg`}
                          thumbClassName="h-8 w-8 shrink-0 rounded object-cover"
                          {...meterPhotoActions(b.id)}
                        />
                      )}
                      <div className="min-w-0">
                        {open ? (
                          <>
                            <p className="text-[13px]">
                              Since {fmtDate(b.startDate)} · <span className="font-mono">{num(b.startReading)}</span>
                            </p>
                            <p className="text-[11px] text-marigold-foreground">In progress, not billed yet</p>
                          </>
                        ) : (
                          <>
                            <p className="text-[13px]">
                              {fmtDate(b.startDate)} → {fmtDate(b.endDate)} · {num(b.units)} units
                            </p>
                            <p className="font-mono text-[11px] text-muted-foreground">
                              {num(b.startReading)} → {num(b.endReading)}
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {!open && <Amount value={b.amount} size="sm" />}
                      <button onClick={() => handleDeleteReading(b.id)} className="text-xs text-destructive">
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Panel>

      {/* 2b. Month by month */}
      <MonthByMonth
        statement={statement}
        onPay={(line) => payCharge(line, line.outstanding)}
        onAdjust={(line) => adjustCharge({ id: line.id, description: line.description, amount: line.billed, paid: line.paid })}
      />

      {/* 3. Twelve months of paying */}
      <TwelveMonthsCard tenant={tenant} />

      {/* 4. Payments */}
      <Panel>
        <SectionHeading>Payments</SectionHeading>
        {tenant.ledgerEntries.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No payments recorded yet.</p>
        ) : (
          <div>
            {tenant.ledgerEntries.map((t) => {
              const monthsCovered = new Set(t.allocations.map((a) => a.charge.period)).size;
              const isAdvance = monthsCovered > 1;
              return (
                <div key={t.id} className="khata-row py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold capitalize">
                      {isAdvance ? "Advance payment" : t.type.toLowerCase()}
                      {isAdvance && (
                        <Badge variant="outline" className="ml-1.5 border-primary/40 text-[10px] text-primary">
                          {monthsCovered} months
                        </Badge>
                      )}
                    </p>
                    <p className="truncate text-[11.5px] text-muted-foreground">
                      {t.receiptNo ? <span className="font-mono">{t.receiptNo}</span> : null}
                      {t.receiptNo ? " · " : ""}
                      {paymentMethodLabel(t.mode)} · {fmtDate(t.date)}
                      {t.note ? ` · ${t.note}` : ""}
                    </p>
                    {isAdvance && (
                      <p className="truncate text-[11.5px] text-muted-foreground">
                        Covers {coveredPeriodsLabel(t.allocations.map((a) => a.charge.period))}
                      </p>
                    )}
                  </div>
                  <span className="khata-amount shrink-0 text-[16px] font-bold">{inr(t.amount)}</span>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* 5. Sticky bottom action bar */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 p-4 pt-8 sm:left-[var(--nav-width,0px)]"
        style={{ background: "linear-gradient(to top, var(--canvas) 60%, transparent)" }}
      >
        <div className="mx-auto flex max-w-lg gap-2">
          <Button className="h-[48px] flex-1 rounded-[13px] text-[13px] font-bold" onClick={() => setPaymentOpen(true)}>
            <Wallet className="h-4 w-4" /> Record payment
          </Button>
          <Button
            variant="outline"
            className="h-[48px] flex-1 rounded-[13px] border-input bg-background text-[13px] font-bold"
            onClick={() => setDuesReminderOpen(true)}
          >
            <MessageCircle className="h-4 w-4" /> Remind
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline" className="h-[48px] w-[46px] shrink-0 rounded-[13px] border-input bg-background p-0" />}
            >
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top">
              <DropdownMenuItem onClick={() => setEditOpen(true)}>
                <Pencil className="h-3.5 w-3.5" /> Edit details
              </DropdownMenuItem>
              {tenant.status === "ACTIVE" && (
                <DropdownMenuItem onClick={() => setCheckoutOpen(true)}>
                  <LogOut className="h-3.5 w-3.5" /> Checkout
                </DropdownMenuItem>
              )}
              <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <TenantFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        initial={{ ...tenant, rentAmount: Number(tenant.rentAmount), depositAmount: Number(tenant.depositAmount), joinDate: tenant.joinDate.toISOString().slice(0, 10) } as never}
        electricityRatePerUnit={electricityRate}
        roomOptions={roomOptions}
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
      <CheckoutDialog open={checkoutOpen} onOpenChange={setCheckoutOpen} tenant={tenant as never} />
      <ChargeFormDialog
        open={chargeOpen}
        onOpenChange={setChargeOpen}
        tenantId={tenant.id}
        tenantName={tenant.name}
        roomId={tenant.roomId}
      />
      <LedgerFormDialog
        open={paymentOpen}
        onOpenChange={(o) => {
          setPaymentOpen(o);
          if (!o) router.refresh();
        }}
        tenants={[{ id: tenant.id, name: tenant.name, roomNumber: tenant.roomNumber, rentAmount: tenant.rentAmount }]}
        fixedTenantId={tenant.id}
        outstandingAmount={owedNow > 0.005 ? owedNow : undefined}
      />
      {paying && (
        <LedgerFormDialog
          key={paying.id}
          open
          onOpenChange={(o) => {
            if (!o) {
              setPaying(null);
              router.refresh();
            }
          }}
          tenants={[{ id: tenant.id, name: tenant.name, roomNumber: tenant.roomNumber, rentAmount: tenant.rentAmount }]}
          fixedTenantId={tenant.id}
          outstandingAmount={paying.outstanding}
          chargeId={paying.id}
          chargeLabel={paying.label}
          chargeType={paying.type}
        />
      )}
      {adjusting && (
        <AdjustChargeDialog
          key={adjusting.id}
          open
          onOpenChange={(o) => !o && setAdjusting(null)}
          charge={adjusting}
        />
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
 * The tenant's statement, one collapsible row per month they've been here:
 * what was provided, what it cost, and what's been paid *for* that month,
 * whenever the money actually came in. Newest first; months with nothing
 * on them (before they joined, after they left) are skipped.
 */
function MonthByMonth({
  statement,
  onPay,
  onAdjust,
}: {
  statement: Statement;
  onPay: (line: StatementLine) => void;
  onAdjust: (line: StatementLine) => void;
}) {
  const [openPeriod, setOpenPeriod] = useState<string | null>(null);
  const months = [...statement.months].reverse().filter((m) => !m.empty);

  return (
    <Panel>
      <SectionHeading>Month by month</SectionHeading>
      <p className="-mt-1 mb-2 text-[11.5px] leading-[1.45] text-muted-foreground">
        What each month cost and what&apos;s been paid towards it. A payment counts for the month it settles, not the
        day it was made.
      </p>
      {months.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Nothing billed yet.</p>
      ) : (
        <div>
          {months.map((m) => {
            const expanded = openPeriod === m.period;
            const badge = STATUS_BADGE[m.status];
            return (
              <div key={m.period} className="border-b border-border/70 last:border-b-0">
                <button
                  type="button"
                  onClick={() => setOpenPeriod(expanded ? null : m.period)}
                  className="flex w-full items-start justify-between gap-3 py-2.5 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] font-semibold">
                      {expanded ? (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      {periodLabel(m.period)}
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", badge.className)}>{badge.label}</span>
                    </p>
                    {m.services.length > 0 && (
                      <p className="mt-1 flex flex-wrap gap-1 pl-5">
                        {m.services.map((s) => (
                          <span key={s} className="rounded-md bg-muted px-1.5 py-0.5 text-[10.5px] text-muted-foreground">
                            {s}
                          </span>
                        ))}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <Amount value={m.outstanding} tone={m.outstanding > 0.005 ? "owed" : "positive"} size="sm" />
                    <p className="text-[10.5px] text-muted-foreground">
                      billed {inr(m.billed)} · paid {inr(m.paid)}
                    </p>
                  </div>
                </button>

                {expanded && (
                  <div className="mb-2.5 rounded-xl border border-border/70 bg-muted/30 p-2.5 text-[12.5px]">
                    {m.lines.length === 0 ? (
                      <p className="text-muted-foreground">No charges this month.</p>
                    ) : (
                      m.lines.map((line) => (
                        <div key={line.id} className="flex items-start justify-between gap-3 border-b border-border/50 py-1.5 last:border-b-0">
                          <div className="min-w-0">
                            <p className={cn("leading-snug", line.waived && "text-muted-foreground line-through")}>
                              <span className="font-semibold">{CHARGE_TYPE_LABELS[line.type]}</span>{" "}
                              <span className="text-muted-foreground">· {line.description}</span>
                            </p>
                            {line.reading && (
                              <p className="font-mono text-[11px] text-muted-foreground">
                                {line.reading.from} → {line.reading.to ?? "…"}
                                {line.reading.units !== null ? ` · ${line.reading.units} units` : ""}
                              </p>
                            )}
                            <p className="text-[11px] text-muted-foreground">
                              Due {fmtDate(line.dueDate)}
                              {line.paid > 0.005 ? ` · paid ${inr(line.paid)}` : ""}
                              {line.waived ? " · waived" : ""}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <div className="text-right">
                              <p className="khata-amount font-bold">{inr(line.billed)}</p>
                              {line.outstanding > 0.005 && (
                                <p className="khata-amount text-[11px] text-ledger">{inr(line.outstanding)} due</p>
                              )}
                            </div>
                            {!line.waived && (
                              <Button size="xs" variant="ghost" onClick={() => onAdjust(line)} title="Settle for a different amount">
                                Edit
                              </Button>
                            )}
                            {line.outstanding > 0.005 && (
                              <Button size="xs" variant="outline" onClick={() => onPay(line)}>
                                Pay
                              </Button>
                            )}
                          </div>
                        </div>
                      ))
                    )}

                    {m.payments.length > 0 && (
                      <div className="mt-2 border-t border-border/70 pt-2">
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Paid towards this month</p>
                        {m.payments.map((p) => (
                          <div key={`${p.id}-${m.period}`} className="flex items-center justify-between gap-3 py-1">
                            <p className="min-w-0 truncate text-muted-foreground">
                              {fmtDate(p.date)}
                              {p.receiptNo ? (
                                <>
                                  {" · "}
                                  <span className="font-mono">{p.receiptNo}</span>
                                </>
                              ) : null}
                              {" · "}
                              {paymentMethodLabel(p.mode)}
                              {p.appliedHere < p.amount - 0.005 ? ` · part of ${inr(p.amount)}` : ""}
                            </p>
                            <span className="khata-amount shrink-0 font-bold text-positive">{inr(p.appliedHere)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <div className="flex items-center justify-between pt-2.5 text-[12px]">
            <span className="font-semibold">All months</span>
            <span className="text-muted-foreground">
              billed {inr(statement.totals.billed)} · paid {inr(statement.totals.paid)} ·{" "}
              <span className={statement.totals.outstanding > 0.005 ? "font-semibold text-ledger" : "font-semibold text-positive"}>
                {inr(statement.totals.outstanding)} due
              </span>
            </span>
          </div>
        </div>
      )}
    </Panel>
  );
}

/**
 * One thin bar per of the last 12 calendar months: full-height track in
 * `--secondary`, the paid portion drawn as an inner bar colored by how that
 * month's rent went - clean, short, or (marked with a red !) not paid at all.
 * A month before the tenant joined (no rent charge raised) is left as a bare
 * track: there was nothing to pay.
 */
function TwelveMonthsCard({ tenant }: { tenant: TenantDetail }) {
  const rentByPeriod = new Map<string, ChargeRow[]>();
  for (const c of tenant.charges) {
    if (c.type !== "RENT") continue;
    (rentByPeriod.get(c.period) ?? rentByPeriod.set(c.period, []).get(c.period)!).push(c);
  }

  const today = todayISO();
  const months: {
    period: string;
    short: string;
    billed: number;
    paid: number;
    status: "none" | "paid" | "partial" | "unbilled";
    late: boolean;
  }[] = [];

  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const period = periodOf(d);
    const charges = rentByPeriod.get(period) ?? [];
    const billed = round(charges.reduce((s, c) => s + num(c.amount), 0));
    const paid = round(charges.reduce((s, c) => s + chargePaid(c), 0));
    const late = charges.some((c) => dateISO(c.dueDate) < today && chargeOutstanding(c) > 0.005);
    const status: (typeof months)[number]["status"] =
      charges.length === 0 ? "unbilled" : paid <= 0.005 ? "none" : paid >= billed - 0.005 ? "paid" : "partial";
    months.push({ period, short: d.toLocaleDateString("en-IN", { month: "short" }).slice(0, 1), billed, paid, status, late });
  }

  // recharts' "auto" domain doesn't reliably size to the data with two
  // overlapping bars sharing an axis, so the domain is computed by hand.
  const billedMax = Math.max(1, ...months.map((m) => m.billed)) * 1.1;

  return (
    <Panel>
      <SectionHeading>Twelve months of paying</SectionHeading>
      <p className="-mt-1 mb-3 text-[11.5px] leading-[1.45] text-muted-foreground">
        Each bar is a month&apos;s rent: full green means paid in full, amber means partial, and a red mark means nothing
        came in.
      </p>
      <div className="relative h-[140px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={months} barGap={-14} margin={{ top: 14, right: 0, bottom: 0, left: 0 }}>
            <XAxis dataKey="short" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
            <YAxis hide domain={[0, billedMax]} />
            <Bar dataKey="billed" fill="var(--secondary)" radius={4} barSize={14} isAnimationActive={false} />
            <Bar dataKey="paid" radius={4} barSize={14} isAnimationActive={false}>
              {months.map((m) => (
                <Cell
                  key={m.period}
                  fill={
                    m.status === "paid"
                      ? "var(--chart-rent)"
                      : m.status === "partial"
                        ? "var(--marigold)"
                        : "transparent"
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-x-0 top-0 grid grid-cols-12">
          {months.map((m) => (
            <span key={m.period} className="text-center text-[11px] font-bold text-ledger">
              {m.status === "none" && m.late ? "!" : ""}
            </span>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}
