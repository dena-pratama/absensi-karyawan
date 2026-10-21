"use client";

import { AnimatePresence, m } from "motion/react";
import { Icon } from "@/components/icon";
import { TOAST } from "@/components/motion";
import { BodyPortal } from "@/components/popup-overlay";

export type ToastMessage = { text: string; error: boolean } | null;

/**
 * Notifikasi kecil di bawah layar, naik masuk / turun keluar (Motion).
 * Teks juga diumumkan ke pembaca layar lewat region live yang selalu ada.
 * `position` default di atas bilah navigasi bawah mobile; halaman tanpa bilah itu (login) bisa menimpanya.
 */
export function Toast({ toast, position = "bottom-24 md:bottom-6" }: { toast: ToastMessage; position?: string }) {
  return (
    <BodyPortal>
      <div role="status" aria-live="polite" className="sr-only">
        {toast?.text}
      </div>
      <div className={`fixed ${position} inset-x-0 z-[60] flex justify-center pointer-events-none px-4`}>
        <AnimatePresence>
          {toast && (
            <m.div
              key={`${toast.error}-${toast.text}`}
              {...TOAST}
              aria-hidden="true"
              className="px-4 py-2.5 rounded-lg bg-panel-raised text-gray-100 shadow-2xl flex items-center gap-2.5 text-xs max-w-[90vw]"
            >
              <Icon
                name={toast.error ? "error" : "check_circle"}
                className={`text-[18px] ${toast.error ? "text-rose-400" : "text-emerald-400"}`}
              />
              {toast.text}
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </BodyPortal>
  );
}
