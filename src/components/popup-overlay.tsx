"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

const noop = () => () => {};

/**
 * Lapisan pop up (modal, penampil foto): latar gelap polos tanpa blur + isi di tengah.
 *
 * Di-render ke <body> lewat portal. Shell aplikasi memakai backdrop-filter, yang membuat
 * elemen `fixed` di dalamnya menempel ke kotak shell (bukan layar) — latarnya jadi tidak
 * menutupi sudut membulat shell. Lewat portal, latar selalu menutupi seluruh layar.
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
        <div aria-hidden="true" className="fixed inset-0 bg-black/55 light:bg-black/35" onClick={onClose} />
        {children}
      </div>
    </BodyPortal>
  );
}

/** Render ke <body> supaya elemen `fixed` (pop up, toast) mengacu ke layar, bukan ke shell ber-blur. */
export function BodyPortal({ children }: { children: React.ReactNode }) {
  // false di server & saat hydration, true setelah tampil di browser → tanpa hydration mismatch.
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  return mounted ? createPortal(children, document.body) : null;
}
