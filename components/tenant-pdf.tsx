/* eslint-disable jsx-a11y/alt-text -- react-pdf's Image is not a DOM <img>; it has no alt prop */
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { getTenant } from "@/app/actions/tenants";
import { buildStatement } from "@/lib/statement";
import { num, periodLabel } from "@/lib/charges";

/*
 * Server-only: rendered to a buffer by app/api/tenants/[id]/pdf/route.ts.
 *
 * Helvetica (a built-in PDF font) has no rupee glyph, so amounts are written
 * "Rs 5,000" rather than risking a tofu box in front of every figure.
 */

type TenantDetail = NonNullable<Awaited<ReturnType<typeof getTenant>>>;

export type TenantPdfProps = {
  tenant: TenantDetail;
  pg: { name: string; address: string; contact: string; ownerName: string };
  generatedAt: Date;
};

const INK = "#16233a";
const MUTED = "#66708a";
const RULE = "#e3e4de";
const OWED = "#b93a32";
const POSITIVE = "#2c7a5b";

const s = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 9.5, color: INK, paddingTop: 36, paddingBottom: 48, paddingHorizontal: 40 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 },
  pgName: { fontFamily: "Helvetica-Bold", fontSize: 15 },
  small: { fontSize: 8.5, color: MUTED },
  title: { fontFamily: "Helvetica-Bold", fontSize: 11, textAlign: "right" },
  section: { marginTop: 14 },
  sectionLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: MUTED,
    marginBottom: 5,
    paddingBottom: 3,
    borderBottomWidth: 0.75,
    borderBottomColor: RULE,
  },
  row: { flexDirection: "row", paddingVertical: 2.5 },
  kv: { flexDirection: "row", paddingVertical: 1.8 },
  k: { width: 120, color: MUTED },
  v: { flex: 1 },
  grid2: { flexDirection: "row", gap: 16 },
  col: { flex: 1 },
  photo: { width: 64, height: 64, borderRadius: 8, objectFit: "cover", marginRight: 12 },
  identityRow: { flexDirection: "row", alignItems: "flex-start" },
  name: { fontFamily: "Helvetica-Bold", fontSize: 14 },
  tableHead: {
    flexDirection: "row",
    borderBottomWidth: 0.75,
    borderBottomColor: RULE,
    paddingBottom: 3,
    marginBottom: 2,
    color: MUTED,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
  },
  tableRow: { flexDirection: "row", paddingVertical: 2.5, borderBottomWidth: 0.4, borderBottomColor: RULE },
  num: { textAlign: "right" },
  bold: { fontFamily: "Helvetica-Bold" },
  owed: { color: OWED },
  positive: { color: POSITIVE },
  monthBlock: { marginTop: 8, borderWidth: 0.75, borderColor: RULE, borderRadius: 4, padding: 8 },
  monthHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 },
  monthName: { fontFamily: "Helvetica-Bold", fontSize: 10.5 },
  subLabel: { fontSize: 8, color: MUTED, fontFamily: "Helvetica-Bold", marginTop: 4, marginBottom: 1 },
  subtotal: { flexDirection: "row", justifyContent: "flex-end", gap: 14, marginTop: 4, paddingTop: 3, borderTopWidth: 0.5, borderTopColor: RULE },
  totalsBox: { marginTop: 10, padding: 8, backgroundColor: "#f6f6f3", borderRadius: 4, flexDirection: "row", justifyContent: "space-between" },
  totalCell: { alignItems: "center", flex: 1 },
  totalValue: { fontFamily: "Helvetica-Bold", fontSize: 12, marginTop: 2 },
  footer: {
    position: "absolute",
    left: 40,
    right: 40,
    bottom: 22,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: MUTED,
    borderTopWidth: 0.5,
    borderTopColor: RULE,
    paddingTop: 4,
  },
  idImage: { width: 240, height: 150, objectFit: "contain", borderWidth: 0.5, borderColor: RULE, borderRadius: 4 },
  idImages: { flexDirection: "row", gap: 16, marginTop: 6 },
});

function rs(n: number | string | { toString(): string } | null | undefined) {
  return `Rs ${num(n as never).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function d(v: Date | string | null | undefined) {
  if (!v) return "-";
  return new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function dateStamp(v: Date) {
  return v.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function facilities(raw: unknown): { name: string; amount: number }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((f): f is { name?: unknown; amount?: unknown } => !!f && typeof f === "object")
    .map((f) => ({ name: String(f.name ?? "").trim(), amount: Number(f.amount ?? 0) }))
    .filter((f) => f.name);
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  if (v === null || v === undefined || v === "") return null;
  return (
    <View style={s.kv}>
      <Text style={s.k}>{k}</Text>
      <Text style={s.v}>{v}</Text>
    </View>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

function Footer({ pgName }: { pgName: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>{pgName} · tenant statement</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );
}

const PAYMENT_TYPE_LABEL: Record<string, string> = { RENT: "Rent", DEPOSIT: "Deposit", REFUND: "Refund", OTHER: "Payment" };
const MODE_LABEL: Record<string, string> = { UPI: "UPI", CASH: "Cash", BANK_TRANSFER: "Bank transfer", CHEQUE: "Cheque" };

export function TenantPdf({ tenant, pg, generatedAt }: TenantPdfProps) {
  const agreement = tenant.agreements[0] ?? null;
  const statement = buildStatement(tenant, generatedAt);
  const months = statement.months.filter((m) => !m.empty);
  const roomLabel = tenant.room
    ? `${tenant.room.floor.name} · Room ${tenant.room.number}${tenant.bedNumber ? ` · bed ${tenant.bedNumber}` : ""}`
    : tenant.roomNumber
      ? `Room ${tenant.roomNumber}${tenant.bedNumber ? ` · bed ${tenant.bedNumber}` : ""}`
      : "No room assigned";
  const hasIdImages = !!(tenant.aadhaarFrontUrl || tenant.aadhaarBackUrl);

  return (
    <Document title={`${tenant.name} · ${pg.name}`} author={pg.name}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.pgName}>{pg.name}</Text>
            {pg.address ? <Text style={s.small}>{pg.address}</Text> : null}
            {pg.contact ? <Text style={s.small}>{pg.contact}</Text> : null}
          </View>
          <View>
            <Text style={s.title}>Tenant statement</Text>
            <Text style={[s.small, { textAlign: "right" }]}>Generated {dateStamp(generatedAt)}</Text>
          </View>
        </View>

        <View style={s.identityRow}>
          {tenant.photoUrl ? <Image src={tenant.photoUrl} style={s.photo} /> : null}
          <View style={{ flex: 1 }}>
            <Text style={s.name}>{tenant.name}</Text>
            <Text style={s.small}>
              {roomLabel} · {tenant.status === "ACTIVE" ? "Active" : "Vacated"} · since {d(tenant.joinDate)}
            </Text>
          </View>
        </View>

        <Section label="Identity & contact">
          <View style={s.grid2}>
            <View style={s.col}>
              <KV k="Phone" v={tenant.phone} />
              <KV k="Email" v={tenant.email} />
              <KV k="Father's name" v={tenant.fatherName} />
              <KV k="Mother's name" v={tenant.motherName} />
              <KV k="Address" v={tenant.address} />
            </View>
            <View style={s.col}>
              <KV k="Emergency contact" v={tenant.emergencyContact ? `${tenant.emergencyContact}${tenant.emergencyPhone ? ` (${tenant.emergencyPhone})` : ""}` : null} />
              <KV k="PAN" v={tenant.pan} />
              <KV k={tenant.idProofType || "ID proof"} v={tenant.idProofNumber} />
              <KV k="Vehicle" v={tenant.carNumber ? `${tenant.carNumber}${tenant.carModel ? ` · ${tenant.carModel}` : ""}` : null} />
              <KV k="Notes" v={tenant.notes} />
            </View>
          </View>
        </Section>

        <Section label="Stay & terms">
          <View style={s.grid2}>
            <View style={s.col}>
              <KV k="Room" v={roomLabel} />
              <KV k="Joined" v={d(tenant.joinDate)} />
              <KV k="Status" v={tenant.status === "ACTIVE" ? "Active" : `Vacated ${d(tenant.vacatedDate)}`} />
              {tenant.noticeDate ? <KV k="Notice given" v={`${d(tenant.noticeDate)} · leaving ${d(tenant.expectedVacateDate)}`} /> : null}
              <KV k="Monthly rent" v={rs(tenant.rentOverride ?? tenant.rentAmount)} />
              <KV k="Onboarded by" v={tenant.createdBy} />
            </View>
            <View style={s.col}>
              <KV
                k="Security deposit"
                v={`${rs(tenant.depositAmount)} · ${tenant.depositMethod === "CHEQUE" ? "blank cheque" : MODE_LABEL[tenant.depositMethod] ?? tenant.depositMethod}${
                  tenant.depositChequeNumber ? ` #${tenant.depositChequeNumber}` : ""
                }${tenant.depositChequeBank ? ` · ${tenant.depositChequeBank}` : ""}${
                  agreement ? (agreement.depositRefundable ? " · refundable" : " · non-refundable") : ""
                }`}
              />
              {agreement ? (
                <>
                  <KV k="Electricity" v={`${rs(agreement.electricityRate)} per unit`} />
                  <KV k="Laundry" v={agreement.laundryChargeable ? `${rs(agreement.laundryCharge)} per month` : "Included"} />
                  <KV
                    k="Facilities"
                    v={facilities(agreement.facilities).length ? facilities(agreement.facilities).map((f) => `${f.name} (${rs(f.amount)})`).join(", ") : "None listed"}
                  />
                  <KV k="Agreement note" v={agreement.note} />
                  <KV k="Terms effective" v={d(agreement.effectiveDate)} />
                </>
              ) : null}
              {tenant.status === "VACATED" && tenant.refundAmount !== null ? (
                <KV k={num(tenant.refundAmount) >= 0 ? "Refunded" : "Owed at checkout"} v={`${rs(Math.abs(num(tenant.refundAmount)))} via ${MODE_LABEL[tenant.refundMethod ?? ""] ?? "cash"}`} />
              ) : null}
            </View>
          </View>
        </Section>

        <Section label="Month by month">
          {months.length === 0 ? (
            <Text style={s.small}>Nothing billed yet.</Text>
          ) : (
            months.map((m) => (
              <View key={m.period} style={s.monthBlock} wrap={false}>
                <View style={s.monthHead}>
                  <Text style={s.monthName}>{periodLabel(m.period)}</Text>
                  <Text style={[s.small, m.status === "clear" ? s.positive : m.status === "none" ? {} : s.owed]}>
                    {m.status === "clear" ? "Paid in full" : m.status === "partial" ? "Partly paid" : m.status === "unpaid" ? "Unpaid" : "Nothing billed"}
                  </Text>
                </View>
                {m.services.length > 0 ? <Text style={s.small}>Provided: {m.services.join(" · ")}</Text> : null}

                {m.lines.length > 0 ? (
                  <>
                    <View style={[s.tableHead, { marginTop: 4 }]}>
                      <Text style={{ flex: 3 }}>Charge</Text>
                      <Text style={[{ flex: 1 }, s.num]}>Billed</Text>
                      <Text style={[{ flex: 1 }, s.num]}>Paid</Text>
                      <Text style={[{ flex: 1 }, s.num]}>Outstanding</Text>
                    </View>
                    {m.lines.map((l) => (
                      <View key={l.id} style={s.tableRow}>
                        <View style={{ flex: 3 }}>
                          <Text>{l.description}{l.waived ? " (waived)" : ""}</Text>
                          {l.reading ? (
                            <Text style={s.small}>
                              Meter {l.reading.from.toLocaleString("en-IN")} to {l.reading.to === null ? "open" : l.reading.to.toLocaleString("en-IN")}
                              {l.reading.units !== null ? ` · ${l.reading.units} units` : ""} · {d(l.reading.start)} to {l.reading.end ? d(l.reading.end) : "open"}
                            </Text>
                          ) : null}
                          <Text style={s.small}>Due {d(l.dueDate)}</Text>
                        </View>
                        <Text style={[{ flex: 1 }, s.num]}>{rs(l.billed)}</Text>
                        <Text style={[{ flex: 1 }, s.num]}>{rs(l.paid)}</Text>
                        <Text style={[{ flex: 1 }, s.num, l.outstanding > 0.005 ? s.owed : {}]}>{rs(l.outstanding)}</Text>
                      </View>
                    ))}
                  </>
                ) : null}

                {m.payments.length > 0 ? (
                  <>
                    <Text style={s.subLabel}>PAYMENTS APPLIED TO THIS MONTH</Text>
                    {m.payments.map((p) => (
                      <View key={`${p.id}-${m.period}`} style={s.row}>
                        <Text style={{ flex: 3 }}>
                          {d(p.date)}{p.receiptNo ? ` · ${p.receiptNo}` : ""} · {MODE_LABEL[p.mode] ?? p.mode}
                          {p.appliedHere < p.amount - 0.005 ? ` · part of ${rs(p.amount)}` : ""}
                        </Text>
                        <Text style={[{ flex: 1 }, s.num, s.positive]}>{rs(p.appliedHere)}</Text>
                      </View>
                    ))}
                  </>
                ) : null}

                <View style={s.subtotal}>
                  <Text style={s.small}>Billed {rs(m.billed)}</Text>
                  <Text style={s.small}>Paid {rs(m.paid)}</Text>
                  <Text style={[s.bold, m.outstanding > 0.005 ? s.owed : s.positive]}>Outstanding {rs(m.outstanding)}</Text>
                </View>
              </View>
            ))
          )}

          <View style={s.totalsBox}>
            <View style={s.totalCell}>
              <Text style={s.small}>TOTAL BILLED</Text>
              <Text style={s.totalValue}>{rs(statement.totals.billed)}</Text>
            </View>
            <View style={s.totalCell}>
              <Text style={s.small}>TOTAL PAID</Text>
              <Text style={[s.totalValue, s.positive]}>{rs(statement.totals.paid)}</Text>
            </View>
            <View style={s.totalCell}>
              <Text style={s.small}>OUTSTANDING</Text>
              <Text style={[s.totalValue, statement.totals.outstanding > 0.005 ? s.owed : s.positive]}>{rs(statement.totals.outstanding)}</Text>
            </View>
          </View>
        </Section>

        {tenant.electricityBills.length > 0 ? (
          <Section label="Electricity readings">
            <View style={s.tableHead}>
              <Text style={{ flex: 2 }}>Period</Text>
              <Text style={[{ flex: 1 }, s.num]}>From</Text>
              <Text style={[{ flex: 1 }, s.num]}>To</Text>
              <Text style={[{ flex: 1 }, s.num]}>Units</Text>
              <Text style={[{ flex: 1 }, s.num]}>Amount</Text>
              <Text style={[{ flex: 1 }, s.num]}>Status</Text>
            </View>
            {tenant.electricityBills.map((b) => (
              <View key={b.id} style={s.tableRow}>
                <Text style={{ flex: 2 }}>{d(b.startDate)} to {b.endDate ? d(b.endDate) : "now"}</Text>
                <Text style={[{ flex: 1 }, s.num]}>{num(b.startReading).toLocaleString("en-IN")}</Text>
                <Text style={[{ flex: 1 }, s.num]}>{b.endReading === null ? "-" : num(b.endReading).toLocaleString("en-IN")}</Text>
                <Text style={[{ flex: 1 }, s.num]}>{b.units === null ? "-" : num(b.units)}</Text>
                <Text style={[{ flex: 1 }, s.num]}>{b.amount === null ? "-" : rs(b.amount)}</Text>
                <Text style={[{ flex: 1 }, s.num, s.small]}>{b.endDate ? "Closed" : "Open"}</Text>
              </View>
            ))}
          </Section>
        ) : null}

        <Section label="Payment ledger">
          {tenant.ledgerEntries.length === 0 ? (
            <Text style={s.small}>No payments recorded yet.</Text>
          ) : (
            <>
              <View style={s.tableHead}>
                <Text style={{ flex: 1.2 }}>Date</Text>
                <Text style={{ flex: 1.4 }}>Receipt</Text>
                <Text style={{ flex: 1 }}>Type</Text>
                <Text style={{ flex: 1.2 }}>Mode</Text>
                <Text style={{ flex: 2.4 }}>Note</Text>
                <Text style={[{ flex: 1.2 }, s.num]}>Amount</Text>
              </View>
              {tenant.ledgerEntries.map((e) => (
                <View key={e.id} style={s.tableRow}>
                  <Text style={{ flex: 1.2 }}>{d(e.date)}</Text>
                  <Text style={{ flex: 1.4 }}>{e.receiptNo ?? "-"}</Text>
                  <Text style={{ flex: 1 }}>{PAYMENT_TYPE_LABEL[e.type] ?? e.type}</Text>
                  <Text style={{ flex: 1.2 }}>{MODE_LABEL[e.mode] ?? e.mode}</Text>
                  <Text style={[{ flex: 2.4 }, s.small]}>{e.note ?? ""}</Text>
                  <Text style={[{ flex: 1.2 }, s.num, e.type === "REFUND" ? s.owed : {}]}>{rs(e.amount)}</Text>
                </View>
              ))}
            </>
          )}
        </Section>

        <Footer pgName={pg.name} />
      </Page>

      {hasIdImages ? (
        <Page size="A4" style={s.page}>
          <Section label={`${tenant.idProofType || "ID proof"} · ${tenant.name}`}>
            <View style={s.idImages}>
              {tenant.aadhaarFrontUrl ? (
                <View>
                  <Text style={s.small}>Front</Text>
                  <Image src={tenant.aadhaarFrontUrl} style={s.idImage} />
                </View>
              ) : null}
              {tenant.aadhaarBackUrl ? (
                <View>
                  <Text style={s.small}>Back</Text>
                  <Image src={tenant.aadhaarBackUrl} style={s.idImage} />
                </View>
              ) : null}
            </View>
          </Section>
          <Footer pgName={pg.name} />
        </Page>
      ) : null}
    </Document>
  );
}
