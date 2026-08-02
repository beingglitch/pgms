import { NextRequest, NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 1);

  const stale = await prisma.electricityBill.findMany({
    where: { endDate: { lt: cutoff }, photoUrl: { not: null } },
    select: { id: true, photoUrl: true },
  });

  let deleted = 0;
  for (const bill of stale) {
    try {
      await del(bill.photoUrl!);
      await prisma.electricityBill.update({ where: { id: bill.id }, data: { photoUrl: null } });
      deleted++;
    } catch {
      // best-effort cleanup; leave the record for the next run if the blob delete fails
    }
  }

  return NextResponse.json({ checked: stale.length, deleted });
}
