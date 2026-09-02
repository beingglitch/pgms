"use client";

import { useEffect } from "react";

/**
 * Scrollbars are invisible until hovered (pure CSS) or mid-scroll (this).
 * Touch and keyboard scrolling don't trigger `:hover`, so whichever element
 * just scrolled gets a class that reveals its thumb for a moment, then it
 * fades back out.
 */
export function ScrollbarActivity() {
  useEffect(() => {
    const timers = new WeakMap<EventTarget, ReturnType<typeof setTimeout>>();

    function onScroll(e: Event) {
      const target = e.target;
      if (!(target instanceof Element)) return;
      target.classList.add("is-scrolling");
      const existing = timers.get(target);
      if (existing) clearTimeout(existing);
      timers.set(
        target,
        setTimeout(() => target.classList.remove("is-scrolling"), 800)
      );
    }

    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", onScroll, { capture: true });
  }, []);

  return null;
}
