"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { Camera, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function PhotoUpload({
  value,
  onChange,
  label = "Add photo",
}: {
  value: string | null | undefined;
  onChange: (url: string) => void;
  label?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/upload",
      });
      onChange(blob.url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Photo upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-3">
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="" className="h-14 w-14 rounded-lg border object-cover" />
      ) : (
        <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed bg-muted">
          <Camera className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" onChange={handle} className="hidden" />
      <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
        {uploading ? "Uploading…" : value ? "Change" : label}
      </Button>
    </div>
  );
}
