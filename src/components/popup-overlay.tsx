"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { m } from "motion/react";
import { FADE } from "@/components/motion";

const noop = () => () => {};

/**
 * Lapisan pop up (modal, penampil foto): latar gelap polos tanpa blur + isi di tengah.
 * Latar memudar masuk / keluar; animasi kotak pop up diatur pemanggil (preset `POP`).
 * Bungkus pemanggil dengan <AnimatePresence> supaya animasi keluar sempat berjalan.
 *
 * Di-render ke <body> lewat portal: elemen `fixed` di dalam shell bisa menempel ke
 * kotak shell (bukan layar) bila shell memakai efek seperti backdrop-filter.
 */
export function PopupLayer({
  onClose,
  className = "",
  children,
}: {
  onClose: () => void;
  /** Kelas tambahan wadah (mis. padding / scroll). */
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <BodyPortal>
      <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${className}`}>
        {/* Klik latar = tutup pop up */}
        <m.div {...FADE} aria-hidden="true" className="fixed inset-0 bg-black/55 light:bg-black/35" onClick={onClose} />
        {children}
      </div>
    </BodyPortal>
  );
}

/** Render ke <body> supaya elemen `fixed` (pop up, toast) mengacu ke layar. */
export function BodyPortal({ children }: { children: React.ReactNode }) {
  // false di server & saat hydration, true setelah tampil di browser → tanpa hydration mismatch.
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  return mounted ? createPortal(children, document.body) : null;
}
