"use client";

import { useState } from "react";
import { Download, Loader2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

/**
 * Download / share the tenant's full statement as a PDF, built server-side
 * by /api/tenants/[id]/pdf. Share hands the file to the phone's share sheet
 * (WhatsApp, mail, Drive) where the browser supports sharing files, and
 * quietly falls back to a plain download where it doesn't.
 */

async function fetchPdf(tenantId: string) {
  const res = await fetch(`/api/tenants/${tenantId}/pdf`, { credentials: "same-origin" });
  if (!res.ok) throw new Error(`Couldn't build the PDF (${res.status})`);
  return res.blob();
}

function fileNameFor(tenantName: string) {
  const safe = tenantName.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "tenant";
  return `${safe}.pdf`;
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function shareOrDownload(blob: Blob, fileName: string, title: string) {
  const file = new File([blob], fileName, { type: "application/pdf" });
  if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return "shared" as const;
    } catch (err) {
      // The user dismissing the share sheet isn't an error worth reporting.
      if (err instanceof Error && err.name === "AbortError") return "cancelled" as const;
      throw err;
    }
  }
  triggerDownload(blob, fileName);
  return "downloaded" as const;
}

export function usePdfActions(tenantId: string, tenantName: string) {
  const [busy, setBusy] = useState<"download" | "share" | null>(null);
  const fileName = fileNameFor(tenantName);

  async function download() {
    setBusy("download");
    try {
      triggerDownload(await fetchPdf(tenantId), fileName);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't download the PDF");
    } finally {
      setBusy(null);
    }
  }

  async function share() {
    setBusy("share");
    try {
      const result = await shareOrDownload(await fetchPdf(tenantId), fileName, `${tenantName} · statement`);
      if (result === "downloaded") toast.success("Sharing isn't available here, so the PDF was downloaded instead");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't share the PDF");
    } finally {
      setBusy(null);
    }
  }

  return { busy, download, share };
}

export function TenantPdfActions({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const { busy, download, share } = usePdfActions(tenantId, tenantName);

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={download} disabled={busy !== null}>
        {busy === "download" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        {busy === "download" ? "Preparing…" : "Download PDF"}
      </Button>
      <Button size="sm" variant="outline" onClick={share} disabled={busy !== null}>
        {busy === "share" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}
        {busy === "share" ? "Preparing…" : "Share"}
      </Button>
    </div>
  );
}

/** The same two actions as dropdown-menu items, for mounting inside an overflow "⋯" menu. */
export function TenantPdfMenuItems({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const { busy, download, share } = usePdfActions(tenantId, tenantName);

  return (
    <>
      <DropdownMenuItem onClick={download} disabled={busy !== null}>
        {busy === "download" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        Download PDF
      </DropdownMenuItem>
      <DropdownMenuItem onClick={share} disabled={busy !== null}>
        {busy === "share" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
        Share PDF
      </DropdownMenuItem>
    </>
  );
}
