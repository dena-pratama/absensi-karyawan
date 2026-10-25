"use client";

import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

const GAP = 4;
const EDGE = 8;

/**
 * Posisi `fixed` untuk menu dropdown yang di-render lewat portal ke <body>, menempel di bawah
 * `anchor` (atau di atasnya bila ruang di bawah tidak cukup). Jadi menu tidak terpotong oleh
 * kartu / tabel yang memakai overflow-hidden, dan tetap ikut bergerak saat halaman di-scroll.
 */
export function useAnchored(
  open: boolean,
  anchor: RefObject<HTMLElement | null>,
  { height = 320, minWidth = 256, align = "start" }: { height?: number; minWidth?: number; align?: "start" | "end" } = {},
) {
  const [pos, setPos] = useState<{ style: CSSProperties; up: boolean } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    let frame = 0;
    const update = () => {
      const el = anchor.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const width = Math.min(Math.max(r.width, minWidth), vw - EDGE * 2);
      // align end: tepi kanan menu sejajar tepi kanan pemicu (mis. tombol di pojok kanan topbar)
      const left = Math.min(Math.max(EDGE, align === "end" ? r.right - width : r.left), vw - width - EDGE);
      const below = vh - r.bottom - EDGE;
      const above = r.top - EDGE;
      const up = below < height && above > below;
      setPos({
        up,
        style: up
          ? { position: "fixed", left, width, bottom: vh - r.top + GAP, maxHeight: above - GAP }
          : { position: "fixed", left, width, top: r.bottom + GAP, maxHeight: below - GAP },
      });
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, true); // capture: ikut scroll di dalam modal / tabel
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, [open, anchor, height, minWidth, align]);

  return open ? pos : null;
}
