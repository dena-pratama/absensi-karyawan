"use client";

import { AnimatePresence, m } from "motion/react";
import { Icon } from "@/components/icon";
import { POP } from "@/components/motion";
import { BodyPortal } from "@/components/popup-overlay";

export type ToastMessage = { text: string; error: boolean } | null;

/** Lama tampil notifikasi (ms): berhasil cukup sekilas, pesan gagal lebih lama supaya sempat dibaca. */
export const TOAST_MS = { success: 1500, error: 3500 } as const;
export const toastDuration = (t: { error: boolean }) => (t.error ? TOAST_MS.error : TOAST_MS.success);

type Variant = "success" | "edit" | "delete" | "error";

/** Jenis notifikasi ditebak dari isi pesan, jadi semua pemanggil lama otomatis ikut bergaya baru. */
function variantOf(t: NonNullable<ToastMessage>): Variant {
  if (t.error) return "error";
  if (/dihapus|dibatalkan|ditolak|dicabut/i.test(t.text)) return "delete";
  if (/diperbarui|diubah|diterapkan|dinonaktifkan|ditandai/i.test(t.text)) return "edit";
  return "success";
}

/* Gaya sama dengan dialog konfirmasi: lingkaran ikon berwarna, judul, pesan. */
const STYLE: Record<Variant, { title: string; ring: string; icon: string }> = {
  success: { title: "Berhasil disimpan", ring: "bg-emerald-500/15 ring-emerald-400/40 text-emerald-400", icon: "check" },
  edit: { title: "Perubahan disimpan", ring: "bg-cyan-500/15 ring-cyan-400/40 text-cyan-400", icon: "edit" },
  delete: { title: "Data dihapus", ring: "bg-rose-500/15 ring-rose-400/40 text-rose-400", icon: "delete" },
  error: { title: "Gagal", ring: "bg-amber-500/15 ring-amber-400/40 text-amber-400", icon: "priority_high" },
};

/**
 * Notifikasi di tengah layar, gayanya mengikuti dialog konfirmasi (kartu, ikon dalam lingkaran,
 * judul + pesan). Tidak menghalangi klik di halaman; klik kartu untuk menutup lebih cepat.
 * Teks juga diumumkan ke pembaca layar lewat region live yang selalu ada.
 * `position` & `duration` dipertahankan untuk kompatibilitas pemanggil lama.
 */
export function Toast({ toast, onClose }: { toast: ToastMessage; position?: string; duration?: number; onClose?: () => void }) {
  const variant = toast ? variantOf(toast) : "success";
  const s = STYLE[variant];
  return (
    <BodyPortal>
      <div role="status" aria-live="polite" className="sr-only">
        {toast?.text}
      </div>
      <div className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-none p-4">
        <AnimatePresence>
          {toast && (
            <m.div
              key={`${toast.error}-${toast.text}`}
              {...POP}
              aria-hidden="true"
              onClick={onClose}
              className="pointer-events-auto w-full max-w-xs rounded-2xl border border-line-strong bg-panel-inset shadow-2xl px-6 py-5 flex flex-col items-center text-center gap-2.5"
            >
              <m.span
                initial={{ scale: 0.6 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 380, damping: 18, delay: 0.04 }}
                className={`w-12 h-12 rounded-full ring-1 flex items-center justify-center ${s.ring}`}
              >
                <Icon name={s.icon} className="text-[24px]" />
              </m.span>
              <p className="text-sm font-bold text-ink">{s.title}</p>
              <p className="text-xs text-gray-400 leading-relaxed">{toast.text}</p>
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </BodyPortal>
  );
}
