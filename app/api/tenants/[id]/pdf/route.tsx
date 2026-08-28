import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { isSignedIn } from "@/app/actions/auth";
import { getTenant } from "@/app/actions/tenants";
import { getPgInfo } from "@/app/actions/settings";
import { TenantPdf } from "@/components/tenant-pdf";

export const dynamic = "force-dynamic";

/**
 * Everything about one tenant as a PDF: identity, terms, the month-by-month
 * statement, readings, the payment ledger, and their ID images.
 *
 * proxy.ts already redirects unauthenticated requests here, but a tenant's
 * ID documents are exactly the kind of thing worth defending in depth.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isSignedIn())) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { id } = await params;
  const [tenant, pg] = await Promise.all([getTenant(id), getPgInfo()]);
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  const generatedAt = new Date();
  const buffer = await renderToBuffer(
    <TenantPdf
      tenant={tenant}
      pg={{ name: pg.name, address: pg.address, contact: pg.contact, ownerName: pg.ownerName }}
      generatedAt={generatedAt}
    />
  );

  const safeName = tenant.name.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "tenant";
  const stamp = generatedAt.toISOString().slice(0, 10);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safeName}-${stamp}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
