"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { AnimatePresence, m } from "motion/react";
import { Icon } from "@/components/icon";
import { POP } from "@/components/motion";
import { PopupLayer } from "@/components/popup-overlay";

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** danger = hapus / tidak bisa dibatalkan, warning = buang perubahan, default = tindakan biasa. */
  tone?: "danger" | "warning" | "default";
};

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

/* Satu dialog global: dipanggil dari mana saja lewat confirmDialog(), dirender oleh <ConfirmHost>. */
let current: Pending | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l));

/**
 * Pengganti window.confirm dengan pop up beranimasi. Contoh:
 *   if (!(await confirmDialog({ title: "Hapus cabang?", tone: "danger" }))) return;
 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  current?.resolve(false); // dialog sebelumnya dianggap batal
  return new Promise((resolve) => {
    current = { ...options, resolve };
    emit();
  });
}

function settle(ok: boolean) {
  const c = current;
  current = null;
  emit();
  c?.resolve(ok);
}

const TONE = {
  danger: { icon: "delete_forever", ring: "bg-rose-500/15 ring-rose-400/40 text-rose-300", btn: "bg-rose-500 hover:bg-rose-400 text-white" },
  warning: { icon: "warning", ring: "bg-amber-500/15 ring-amber-400/40 text-amber-300", btn: "bg-amber-400 hover:bg-amber-300 text-black" },
  default: { icon: "help", ring: "bg-cyan-500/15 ring-cyan-400/40 text-cyan-300", btn: "bg-brand hover:bg-brand/90 text-black" },
} as const;

/** Pasang sekali di layout akar. */
export function ConfirmHost() {
  const pending = useSyncExternalStore(subscribe, () => current, () => null);
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!pending) return;
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") settle(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending]);

  const tone = TONE[pending?.tone ?? "default"];

  return (
    <AnimatePresence>
      {pending && (
        <PopupLayer key="confirm" onClose={() => settle(false)}>
          <m.div
            {...POP}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby={pending.message ? "confirm-desc" : undefined}
            className="relative z-10 w-full max-w-sm rounded-2xl border border-line-strong bg-panel-inset shadow-2xl p-6 flex flex-col items-center text-center gap-3"
          >
            <m.span
              initial={{ scale: 0.4 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 420, damping: 15, delay: 0.05 }}
              className={`relative w-14 h-14 rounded-full ring-1 flex items-center justify-center ${tone.ring}`}
            >
              <m.span
                aria-hidden="true"
                animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
                className={`absolute inset-0 rounded-full ring-2 ${tone.ring}`}
              />
              <m.span animate={{ rotate: [0, -10, 10, -6, 0] }} transition={{ duration: 0.5, delay: 0.25 }} className="flex">
                <Icon name={tone.icon} className="text-[28px]" />
              </m.span>
            </m.span>
            <h2 id="confirm-title" className="text-base font-bold text-ink">
              {pending.title}
            </h2>
            {pending.message && (
              <p id="confirm-desc" className="text-xs text-gray-400 leading-relaxed">
                {pending.message}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2 w-full mt-2">
              <button
                type="button"
                onClick={() => settle(false)}
                className="px-4 py-2 rounded-lg border border-line-strong text-xs font-medium text-gray-300 hover:text-ink hover:bg-panel transition"
              >
                {pending.cancelLabel ?? "Batal"}
              </button>
              <button ref={okRef} type="button" onClick={() => settle(true)} className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${tone.btn}`}>
                {pending.confirmLabel ?? "Ya, lanjutkan"}
              </button>
            </div>
          </m.div>
        </PopupLayer>
      )}
    </AnimatePresence>
  );
}
