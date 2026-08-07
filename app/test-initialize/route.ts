import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * Temporary testing helper: visit http://localhost:3000/test-initialize to
 * wipe every tenant/ledger/room record and reset property settings to
 * defaults, so the app comes back up needing first-run setup again, same as
 * a fresh install.
 *
 * Gated on two things, both required: the request's hostname, and
 * UNSAFE_TESTING=true set in the environment. The hostname check alone
 * would still work if this route were ever accidentally deployed and
 * someone found a way to make it see a local-looking Host header; the env
 * var means the route is completely inert unless deliberately turned on,
 * even locally. Neither check is a substitute for the other.
 *
 * Delete this route (and its /test-initialize bypass line in proxy.ts) once
 * you're done testing and before this app is carrying real tenant data.
 */
export async function GET(request: NextRequest) {
  if (process.env.UNSAFE_TESTING !== "true") {
    return NextResponse.json({ error: "Set UNSAFE_TESTING=true to enable this route." }, { status: 403 });
  }

  // `request.nextUrl.hostname` does not reliably reflect the client-supplied
  // Host header on every runtime, so the raw header is checked directly,
  // with its port (if any) stripped before comparing.
  const host = (request.headers.get("host") ?? "").split(":")[0];
  if (!LOCAL_HOSTNAMES.has(host)) {
    return NextResponse.json({ error: "Only reachable from localhost." }, { status: 403 });
  }

  const counts = {
    allocations: (await prisma.allocation.deleteMany()).count,
    charges: (await prisma.charge.deleteMany()).count,
    checkoutDeductions: (await prisma.checkoutDeduction.deleteMany()).count,
    reminders: (await prisma.reminder.deleteMany()).count,
    agreements: (await prisma.agreement.deleteMany()).count,
    electricityBills: (await prisma.electricityBill.deleteMany()).count,
    expenses: (await prisma.expense.deleteMany()).count,
    ledgerEntries: (await prisma.ledgerEntry.deleteMany()).count,
    tenants: (await prisma.tenant.deleteMany()).count,
    rooms: (await prisma.room.deleteMany()).count,
    floors: (await prisma.floor.deleteMany()).count,
    activityLog: (await prisma.activityLog.deleteMany()).count,
    pgInfo: (await prisma.pgInfo.deleteMany()).count,
  };

  return NextResponse.json({ wiped: true, counts });
}
