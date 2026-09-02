import { NextRequest, NextResponse } from "next/server";
import { generateDueRentCharges } from "@/app/actions/charges";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // No session here (bearer-authenticated, not a signed-in owner), so this
  // runs once per account rather than the single global call it used to be.
  const accounts = await prisma.account.findMany({ select: { id: true } });
  let created = 0;
  for (const account of accounts) {
    const result = await generateDueRentCharges(account.id, "System");
    created += result.created;
  }
  return NextResponse.json({ accounts: accounts.length, created });
}
