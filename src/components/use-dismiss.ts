"use client";

import { useEffect, useEffectEvent, type RefObject } from "react";

type Ref = RefObject<HTMLElement | null>;

/**
 * Tutup menu / dropdown saat klik di luar `ref` atau tombol Esc ditekan.
 * `ref` boleh lebih dari satu (mis. tombol pemicu + menu yang di-render lewat portal).
 */
export function useDismiss(open: boolean, ref: Ref | Ref[], close: () => void) {
  const onClose = useEffectEvent(close);
  const refs = Array.isArray(ref) ? ref : [ref];
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!refs.some((r) => r.current?.contains(e.target as Node))) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
    // refs berisi objek ref yang stabil; cukup bergantung pada `open`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
