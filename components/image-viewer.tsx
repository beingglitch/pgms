"use client";

import {
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { upload } from "@vercel/blob/client";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Camera, Download, Loader2, Minus, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const MIN_SCALE = 1;
const MAX_SCALE = 5;

type Point = { x: number; y: number };
type DragState = {
  pointers: Map<number, Point>;
  start: Point;
  startOffset: Point;
  startDist: number;
  startScale: number;
};

/**
 * Full-size view of one photo, the way a social app opens an image: pinch,
 * scroll, double-tap or the slider to zoom, drag to pan once zoomed, and a
 * bar with Download plus, when the caller allows editing, Change and Delete.
 *
 * Download fetches the image as a blob first since `src` is usually a
 * cross-origin blob-storage URL, where a plain `<a download>` would just
 * navigate instead of saving. Change uploads straight to blob storage (same
 * path as PhotoUpload) and hands the new URL back through `onChange`.
 */
export function ImageLightbox({
  src,
  alt = "",
  downloadName,
  open,
  onOpenChange,
  onChange,
  onDelete,
}: {
  src: string;
  alt?: string;
  downloadName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, a Change button lets the viewer replace this image. */
  onChange?: (url: string) => void | Promise<void>;
  /** When set, a Delete button removes this image (after confirming). */
  onDelete?: () => void | Promise<void>;
}) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function clampScale(s: number) {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
  }

  function setZoom(next: number) {
    const clamped = clampScale(next);
    setScale(clamped);
    if (clamped === MIN_SCALE) setOffset({ x: 0, y: 0 });
  }

  function zoomBy(delta: number) {
    setZoom(scale + delta);
  }

  function onWheel(e: ReactWheelEvent<HTMLDivElement>) {
    e.preventDefault();
    zoomBy(e.deltaY > 0 ? -0.4 : 0.4);
  }

  function onDoubleClick() {
    setZoom(scale > 1 ? 1 : 2.5);
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    (e.target as Element).setPointerCapture(e.pointerId);
    setDragging(true);
    const pointers = dragRef.current?.pointers ?? new Map<number, Point>();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      dragRef.current = {
        pointers,
        start: { x: e.clientX, y: e.clientY },
        startOffset: offset,
        startDist: Math.hypot(a.x - b.x, a.y - b.y),
        startScale: scale,
      };
    } else {
      dragRef.current = {
        pointers,
        start: { x: e.clientX, y: e.clientY },
        startOffset: offset,
        startDist: 0,
        startScale: scale,
      };
    }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || !drag.pointers.has(e.pointerId)) return;
    drag.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (drag.pointers.size === 2) {
      const [a, b] = [...drag.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (drag.startDist > 0) setScale(clampScale((drag.startScale * dist) / drag.startDist));
      return;
    }

    if (scale <= 1) return;
    setOffset({
      x: drag.startOffset.x + (e.clientX - drag.start.x),
      y: drag.startOffset.y + (e.clientY - drag.start.y),
    });
  }

  function endPointer(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    drag.pointers.delete(e.pointerId);
    if (drag.pointers.size === 0) {
      dragRef.current = null;
      setDragging(false);
      return;
    }
    // Re-baseline on the remaining finger so it doesn't jump when the other lifts.
    const [[, remaining]] = [...drag.pointers.entries()];
    dragRef.current = { pointers: drag.pointers, start: remaining, startOffset: offset, startDist: 0, startScale: scale };
  }

  async function download() {
    setDownloading(true);
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = downloadName || alt || "photo";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // Cross-origin fetch blocked or offline: fall back to letting the
      // browser open it directly, so the user can still save it manually.
      window.open(src, "_blank");
    } finally {
      setDownloading(false);
    }
  }

  async function replace(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !onChange) return;
    setUploading(true);
    try {
      const blob = await upload(file.name, file, { access: "public", handleUploadUrl: "/api/upload" });
      await onChange(blob.url);
      setZoom(1);
      toast.success("Photo updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Photo upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove() {
    if (!onDelete) return;
    await onDelete();
    setConfirmingDelete(false);
    onOpenChange(false);
    toast.success("Photo removed");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setScale(1);
          setOffset({ x: 0, y: 0 });
          setConfirmingDelete(false);
        }
      }}
    >
      <DialogContent
        showCloseButton
        className="flex h-[88vh] w-[95vw] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
      >
        <DialogTitle className="sr-only">{alt || "Photo"}</DialogTitle>
        <div
          className="relative flex-1 touch-none overflow-hidden bg-black/90"
          onWheel={onWheel}
          onDoubleClick={onDoubleClick}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onPointerLeave={endPointer}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            draggable={false}
            className={cn(
              "h-full w-full select-none object-contain",
              scale > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"
            )}
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              transition: dragging ? "none" : "transform 150ms ease-out",
            }}
          />
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm text-white">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading…
            </div>
          )}
        </div>

        <div className="space-y-2 border-t border-border/70 bg-popover p-2.5">
          <div className="flex items-center gap-2">
            <Button type="button" size="icon-sm" variant="ghost" onClick={() => zoomBy(-0.5)} disabled={scale <= MIN_SCALE} title="Zoom out">
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <input
              type="range"
              min={MIN_SCALE}
              max={MAX_SCALE}
              step={0.1}
              value={scale}
              onChange={(e) => setZoom(Number(e.target.value))}
              aria-label="Zoom"
              className="h-1.5 flex-1 cursor-pointer accent-primary"
            />
            <Button type="button" size="icon-sm" variant="ghost" onClick={() => zoomBy(0.5)} disabled={scale >= MAX_SCALE} title="Zoom in">
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <span className="w-11 text-right text-xs tabular text-muted-foreground">{Math.round(scale * 100)}%</span>
          </div>

          {confirmingDelete ? (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm">
              <span className="text-destructive">Remove this photo?</span>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setConfirmingDelete(false)}>
                  Keep
                </Button>
                <Button type="button" size="sm" variant="destructive" onClick={remove}>
                  Remove
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={download} disabled={downloading}>
                <Download className="h-3.5 w-3.5" /> {downloading ? "Downloading…" : "Download"}
              </Button>
              {onChange && (
                <>
                  <input ref={fileRef} type="file" accept="image/*" onChange={replace} className="hidden" />
                  <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
                    <Camera className="h-3.5 w-3.5" /> Change
                  </Button>
                </>
              )}
              {onDelete && (
                <Button type="button" size="sm" variant="destructive" onClick={() => setConfirmingDelete(true)}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

type ZoomableProps = {
  src: string;
  alt?: string;
  downloadName?: string;
  onChange?: (url: string) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
};

/**
 * Stops a click on a thumbnail that sits inside a link or button (a tenant
 * row, say) from also following that link: the photo opens, nothing else.
 */
function openOnly(e: ReactMouseEvent, open: () => void) {
  e.preventDefault();
  e.stopPropagation();
  open();
}

/** A thumbnail `<img>` that opens itself in an `ImageLightbox` on click. */
export function ZoomableImage({
  src,
  alt = "",
  thumbClassName,
  downloadName,
  onChange,
  onDelete,
}: ZoomableProps & { thumbClassName?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => openOnly(e, () => setOpen(true))}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") openOnly(e as unknown as ReactMouseEvent, () => setOpen(true));
        }}
        className="inline-block cursor-zoom-in rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`View ${alt || "photo"} full size`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className={thumbClassName} />
      </span>
      <ImageLightbox
        src={src}
        alt={alt}
        downloadName={downloadName}
        open={open}
        onOpenChange={setOpen}
        onChange={onChange}
        onDelete={onDelete}
      />
    </>
  );
}

/**
 * An avatar that opens its photo full size when it has one, and is a plain
 * avatar otherwise. Safe to drop inside a `<Link>`: the click never
 * navigates. `className` styles the Avatar root; `fallbackClassName` the
 * initials.
 */
export function ZoomableAvatar({
  src,
  name,
  className,
  fallbackClassName,
  downloadName,
  onChange,
  onDelete,
}: Omit<ZoomableProps, "src" | "alt"> & {
  src: string | null | undefined;
  name: string;
  className?: string;
  fallbackClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const fallback = name
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const avatar = (
    <Avatar className={className}>
      <AvatarImage src={src ?? undefined} />
      <AvatarFallback className={fallbackClassName}>{fallback || "?"}</AvatarFallback>
    </Avatar>
  );

  if (!src) return avatar;

  return (
    <>
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => openOnly(e, () => setOpen(true))}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") openOnly(e as unknown as ReactMouseEvent, () => setOpen(true));
        }}
        className="inline-flex shrink-0 cursor-zoom-in rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`View ${name}'s photo full size`}
      >
        {avatar}
      </span>
      <ImageLightbox
        src={src}
        alt={name}
        downloadName={downloadName ?? `${name}-photo.jpg`}
        open={open}
        onOpenChange={setOpen}
        onChange={onChange}
        onDelete={onDelete}
      />
    </>
  );
}
