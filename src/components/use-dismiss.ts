"use client";

import { useEffect, useEffectEvent, type RefObject } from "react";

/** Tutup menu / dropdown saat klik di luar `ref` atau tombol Esc ditekan. */
export function useDismiss(open: boolean, ref: RefObject<HTMLElement | null>, close: () => void) {
  const onClose = useEffectEvent(close);
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, ref]);
}
