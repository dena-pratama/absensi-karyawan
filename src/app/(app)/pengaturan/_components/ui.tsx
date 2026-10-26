"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { Icon } from "@/components/icon";
import { POP } from "@/components/motion";
import { PopupLayer } from "@/components/popup-overlay";

/* Gaya input mengikuti modal "Tambah Entitas Baru" di desain. */
export const inputCls =
  "w-full text-xs bg-panel-inset border border-line-strong text-slate-200 rounded-lg py-2 px-3 focus:outline-none focus:border-cyan-400 disabled:opacity-60";

export const filterCls =
  "bg-panel border border-line rounded-lg text-xs text-gray-200 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all";

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium text-slate-300 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[10px] text-slate-500 mt-1">{hint}</span>}
    </label>
  );
}

export function SelectBox({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block">
      <select {...props} className={`${inputCls} appearance-none pr-8 cursor-pointer ${props.className ?? ""}`}>
        {children}
      </select>
      <Icon name="expand_more" className="absolute right-2 top-1/2 -translate-y-1/2 text-[16px] text-slate-400 pointer-events-none" />
    </span>
  );
}

/** Toggle aktif/nonaktif (gaya switch cyan dari desain). */
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="relative inline-flex items-center cursor-pointer">
      <input
        type="checkbox"
        className="sr-only peer"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
      />
      <span className="w-9 h-5 bg-slate-800 rounded-full peer-focus-visible:ring-2 peer-focus-visible:ring-cyan-400/60 peer-checked:bg-cyan-400 transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:shadow-sm after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
    </label>
  );
}

/** Modal mengambang (gaya desain: header, isi scroll, footer Batal/Simpan). */
export function Modal({
  open,
  title,
  description,
  onClose,
  onSubmit,
  submitLabel,
  error,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // onClose dari parent biasanya arrow function baru tiap render; lewat Effect Event supaya
  // efek tidak jalan ulang tiap ketikan (dulu fokus jadi lompat balik ke field pertama).
  const close = useEffectEvent(() => onClose());

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLElement>("input, select, textarea")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <PopupLayer key="modal" onClose={onClose} className="sm:p-6 overflow-y-auto">
          <m.div
            {...POP}
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            className="relative bg-panel-inset border border-line-strong w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col z-10 my-auto"
          >
            <div className="px-6 py-4 border-b border-line-strong bg-panel-inset flex items-center justify-between gap-3">
              <div>
                <h3 id="modal-title" className="text-base font-bold text-ink flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#00e5ff]" />
                  {title}
                </h3>
                {description && <p className="text-xs text-slate-400 mt-0.5">{description}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Tutup"
                className="p-1.5 rounded-lg text-slate-400 hover:text-ink hover:bg-panel-inset transition"
              >
                <Icon name="close" className="text-[20px]" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onSubmit();
              }}
            >
              <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                {children}
                {error && (
                  <p role="alert" className="text-xs text-rose-300 bg-rose-950/30 border border-rose-500/30 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}
              </div>
              <div className="px-6 py-4 border-t border-line-strong bg-panel-inset flex items-center justify-between">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg border border-line-strong text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-panel-inset transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold rounded-lg text-xs transition shadow-md shadow-cyan-400/25 flex items-center gap-1.5"
                >
                  <Icon name="check" className="text-[15px]" />
                  {submitLabel}
                </button>
              </div>
            </form>
          </m.div>
        </PopupLayer>
      )}
    </AnimatePresence>
  );
}

/** Bar bawah "Reset / Terapkan Pengaturan" (simpan sekaligus). */
export function ApplyBar({
  count,
  saving,
  onReset,
  onApply,
  idleText,
}: {
  count: number;
  saving: boolean;
  onReset: () => void;
  onApply: () => void;
  idleText: string;
}) {
  const dirty = count > 0;
  return (
    <div className="sticky bottom-[5.25rem] md:bottom-0 z-20 -mx-1 px-1 pt-3 pb-1 bg-shell/95 backdrop-blur border-t border-line flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
      <div className="flex items-center gap-2 text-gray-400">
        <span className={`w-2 h-2 rounded-full ${dirty ? "bg-amber-400" : "bg-emerald-400"}`} />
        {dirty ? `${count} perubahan belum diterapkan` : idleText}
      </div>
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onReset}
          disabled={!dirty || saving}
          className="px-3 py-1.5 rounded-lg border border-line bg-panel text-gray-400 hover:text-ink hover:border-gray-500 transition-colors disabled:opacity-50 disabled:pointer-events-none"
        >
          Reset Perubahan
        </button>
        <button
          type="button"
          onClick={onApply}
          disabled={!dirty || saving}
          className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-brand hover:bg-brand/90 text-black font-semibold shadow-[0_0_15px_rgba(0,210,255,0.25)] transition-all disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed"
        >
          {saving ? (
            <span className="w-3.5 h-3.5 rounded-full border-2 border-black border-t-transparent animate-spin" />
          ) : (
            <Icon name="check" className="text-[16px]" />
          )}
          Terapkan Pengaturan
        </button>
      </div>
    </div>
  );
}

export { Toast } from "@/components/toast";

/**
 * Input kata sandi untuk akun LAIN (tambah / ubah akun), aman dari isi-otomatis browser.
 * Browser (Chrome / Edge) suka mengisi kata sandi tersimpan milik admin ke field password mana pun,
 * diam-diam, sehingga akun karyawan ikut berganti kata sandi tanpa disadari. Pencegahan:
 * field read-only sampai benar-benar difokus (browser tidak mengisi field read-only),
 * autoComplete "new-password", dan atribut pengabaian password manager populer.
 */
export function SecretInput({
  value,
  onChange,
  placeholder,
  required,
  minLength,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  label?: string;
}) {
  const [show, setShow] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  return (
    <span className="relative block">
      <input
        type={show ? "text" : "password"}
        name="kata-sandi-akun-lain"
        aria-label={label}
        className={`${inputCls} pr-9`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={!unlocked}
        onFocus={() => setUnlocked(true)}
        autoComplete="new-password"
        data-lpignore="true"
        data-1p-ignore="true"
        data-bwignore="true"
        data-form-type="other"
        placeholder={placeholder}
        required={required}
        minLength={minLength}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-brand-ink"
      >
        <Icon name={show ? "visibility_off" : "visibility"} className="text-[17px]" />
      </button>
    </span>
  );
}

/** Tombol hapus baris tabel (ikon tong sampah). */
export function DeleteButton({ label, disabled, title, onClick }: { label: string; disabled?: boolean; title?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title={title ?? "Hapus"}
      aria-label={`Hapus ${label}`}
      onClick={onClick}
      disabled={disabled}
      className="p-1 text-gray-400 hover:text-rose-400 transition disabled:opacity-40 disabled:pointer-events-none"
    >
      <Icon name="delete" className="text-[18px]" />
    </button>
  );
}

/** Badge "Baru" / "Diubah" pada baris yang belum diterapkan. */
export function ChangeBadge({ isNew, changed }: { isNew: boolean; changed: boolean }) {
  if (!isNew && !changed) return null;
  return (
    <span
      className={`text-[9px] px-1.5 py-px rounded border ${
        isNew ? "bg-cyan-500/10 text-cyan-300 border-cyan-500/30" : "bg-amber-500/10 text-amber-300 border-amber-500/30"
      }`}
    >
      {isNew ? "Baru" : "Diubah"}
    </span>
  );
}

export function Pagination({
  page,
  pages,
  onPage,
}: {
  page: number;
  pages: number;
  onPage: (p: number) => void;
}) {
  if (pages <= 1) return null;
  const btn = "px-2.5 py-1 rounded-lg border border-line bg-panel text-xs text-gray-300 hover:text-ink disabled:opacity-40";
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" className={btn} disabled={page === 1} onClick={() => onPage(page - 1)}>
        Prev
      </button>
      {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
        <button
          key={p}
          type="button"
          aria-current={p === page ? "page" : undefined}
          onClick={() => onPage(p)}
          className={`${btn} ${p === page ? "border-cyan-500/60 text-cyan-300" : ""}`}
        >
          {p}
        </button>
      ))}
      <button type="button" className={btn} disabled={page === pages} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </div>
  );
}

/** Hook toast sederhana. */
export function useToastTimer(toast: unknown, clear: () => void) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(clear, 3600);
    return () => clearTimeout(t);
  }, [toast, clear]);
}
