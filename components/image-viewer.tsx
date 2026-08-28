"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

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
 * Full-size view of one photo: pinch/scroll/double-tap to zoom, drag to pan
 * once zoomed, and a Download button. Fetched as a blob before saving since
 * `src` is usually a cross-origin blob-storage URL, where a plain `<a
 * download>` would just navigate instead of saving.
 */
export function ImageLightbox({
  src,
  alt = "",
  downloadName,
  open,
  onOpenChange,
}: {
  src: string;
  alt?: string;
  downloadName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [downloading, setDownloading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<DragState | null>(null);

  function clampScale(s: number) {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
  }

  function zoomBy(delta: number) {
    setScale((s) => {
      const next = clampScale(s + delta);
      if (next === MIN_SCALE) setOffset({ x: 0, y: 0 });
      return next;
    });
  }

  function onWheel(e: ReactWheelEvent<HTMLDivElement>) {
    e.preventDefault();
    zoomBy(e.deltaY > 0 ? -0.4 : 0.4);
  }

  function onDoubleClick() {
    setScale((s) => (s > 1 ? 1 : 2.5));
    setOffset({ x: 0, y: 0 });
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

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setScale(1);
          setOffset({ x: 0, y: 0 });
        }
      }}
    >
      <DialogContent
        showCloseButton
        className="flex h-[88vh] w-[95vw] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
      >
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
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border/70 bg-popover p-2.5">
          <div className="flex items-center gap-1.5">
            <Button type="button" size="icon-sm" variant="ghost" onClick={() => zoomBy(-0.6)} disabled={scale <= MIN_SCALE} title="Zoom out">
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <span className="w-10 text-center text-xs tabular text-muted-foreground">{Math.round(scale * 100)}%</span>
            <Button type="button" size="icon-sm" variant="ghost" onClick={() => zoomBy(0.6)} disabled={scale >= MAX_SCALE} title="Zoom in">
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Button type="button" size="sm" variant="secondary" onClick={download} disabled={downloading}>
            <Download className="h-3.5 w-3.5" /> {downloading ? "Downloading…" : "Download"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** A thumbnail `<img>` that opens itself in an `ImageLightbox` on click. */
export function ZoomableImage({
  src,
  alt = "",
  thumbClassName,
  downloadName,
}: {
  src: string;
  alt?: string;
  thumbClassName?: string;
  downloadName?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="cursor-zoom-in rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`View ${alt || "photo"} full size`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className={thumbClassName} />
      </button>
      <ImageLightbox src={src} alt={alt} downloadName={downloadName} open={open} onOpenChange={setOpen} />
    </>
  );
}
