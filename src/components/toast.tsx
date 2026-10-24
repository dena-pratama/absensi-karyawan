"use client";

import { AnimatePresence, m } from "motion/react";
import { Icon } from "@/components/icon";
import { EASE_OUT } from "@/components/motion";
import { BodyPortal } from "@/components/popup-overlay";

export type ToastMessage = { text: string; error: boolean } | null;

type Variant = "success" | "edit" | "delete" | "error";

/** Jenis notifikasi ditebak dari isi pesan, jadi semua pemanggil lama otomatis ikut bergaya baru. */
function variantOf(t: NonNullable<ToastMessage>): Variant {
  if (t.error) return "error";
  if (/dihapus|dibatalkan|ditolak|dicabut/i.test(t.text)) return "delete";
  if (/diperbarui|diubah|diterapkan|dinonaktifkan|ditandai/i.test(t.text)) return "edit";
  return "success";
}

const STYLE: Record<Variant, { title: string; ring: string; bar: string; icon: string }> = {
  success: { title: "Berhasil disimpan", ring: "bg-emerald-500/15 ring-emerald-400/40 text-emerald-300", bar: "bg-emerald-400", icon: "check" },
  edit: { title: "Perubahan diterapkan", ring: "bg-cyan-500/15 ring-cyan-400/40 text-cyan-300", bar: "bg-cyan-400", icon: "edit" },
  delete: { title: "Data dihapus", ring: "bg-rose-500/15 ring-rose-400/40 text-rose-300", bar: "bg-rose-400", icon: "delete" },
  error: { title: "Gagal", ring: "bg-amber-500/15 ring-amber-400/40 text-amber-300", bar: "bg-amber-400", icon: "error" },
};

/** Ikon dalam lingkaran: centang digambar (success), ikon lain memantul / bergoyang. */
function ToastIcon({ variant }: { variant: Variant }) {
  const s = STYLE[variant];
  return (
    <m.span
      initial={{ scale: 0.4, rotate: variant === "delete" ? -12 : 0 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 16, delay: 0.05 }}
      className={`relative w-9 h-9 rounded-full ring-1 flex items-center justify-center flex-shrink-0 ${s.ring}`}
    >
      {/* denyut cincin sekali saat muncul */}
      <m.span
        aria-hidden="true"
        initial={{ scale: 1, opacity: 0.6 }}
        animate={{ scale: 1.8, opacity: 0 }}
        transition={{ duration: 0.7, ease: "easeOut", delay: 0.1 }}
        className={`absolute inset-0 rounded-full ring-2 ${s.ring}`}
      />
      {variant === "success" ? (
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <m.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35, delay: 0.15, ease: EASE_OUT }} />
        </svg>
      ) : (
        <m.span
          animate={variant === "error" || variant === "delete" ? { x: [0, -3, 3, -2, 2, 0] } : { rotate: [0, -14, 10, 0] }}
          transition={{ duration: 0.45, delay: 0.2 }}
          className="flex"
        >
          <Icon name={s.icon} className="text-[19px]" />
        </m.span>
      )}
    </m.span>
  );
}

/**
 * Notifikasi pop up di bawah layar (Motion): masuk memantul, ikon beranimasi sesuai jenis
 * (simpan / ubah / hapus / gagal) dan garis waktu menyusut sampai notifikasi hilang.
 * Teks juga diumumkan ke pembaca layar lewat region live yang selalu ada.
 * `position` default di atas bilah navigasi bawah mobile; halaman tanpa bilah itu (login) bisa menimpanya.
 * `duration` (ms) = lama tampil (samakan dengan timer pemanggil) untuk garis waktu.
 */
export function Toast({ toast, position = "bottom-24 md:bottom-6", duration = 3600 }: { toast: ToastMessage; position?: string; duration?: number }) {
  const variant = toast ? variantOf(toast) : "success";
  const s = STYLE[variant];
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
              initial={{ opacity: 0, y: 28, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 14, scale: 0.96, transition: { duration: 0.16 } }}
              transition={{ type: "spring", stiffness: 380, damping: 26 }}
              aria-hidden="true"
              className="relative overflow-hidden min-w-[260px] max-w-[min(92vw,420px)] rounded-2xl border border-line-strong bg-panel-raised/95 shadow-2xl"
            >
              <div className="flex items-center gap-3 px-4 py-3">
                <ToastIcon variant={variant} />
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-ink leading-tight">{s.title}</p>
                  <p className="text-xs text-gray-300 mt-0.5 leading-snug">{toast.text}</p>
                </div>
              </div>
              <m.span
                aria-hidden="true"
                initial={{ scaleX: 1 }}
                animate={{ scaleX: 0 }}
                transition={{ duration: duration / 1000, ease: "linear" }}
                style={{ transformOrigin: "left" }}
                className={`absolute left-0 bottom-0 h-[3px] w-full ${s.bar} opacity-80`}
              />
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </BodyPortal>
  );
}
