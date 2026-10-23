"use client";

import { useId, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { Icon } from "@/components/icon";
import { DROP } from "@/components/motion";
import { BodyPortal } from "@/components/popup-overlay";
import { useAnchored } from "@/components/use-anchored";
import { useDismiss } from "@/components/use-dismiss";

export type SearchOption = {
  id: string;
  label: string;
  sub?: string;
  disabled?: boolean;
};

/**
 * Pengganti <select> untuk daftar panjang (mis. karyawan): menu dengan kotak pencarian,
 * bisa dipakai dengan keyboard (↑ ↓ Enter Esc). `emptyLabel` = pilihan kosong ("").
 * Menu di-render ke <body> (portal) supaya tidak terpotong kartu / tabel, dan membuka ke atas
 * bila ruang di bawah tidak cukup.
 */
export function SearchSelect({
  value,
  options,
  onChange,
  placeholder = "Pilih…",
  emptyLabel,
  searchPlaceholder = "Cari nama atau NIK...",
  label,
}: {
  value: string;
  options: SearchOption[];
  onChange: (id: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  searchPlaceholder?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const close = () => (setOpen(false), setQuery(""));
  useDismiss(open, [ref, menuRef], close);
  const pos = useAnchored(open, ref);

  const q = query.trim().toLowerCase();
  const matches = q ? options.filter((o) => `${o.label} ${o.sub ?? ""}`.toLowerCase().includes(q)) : options;
  const items: SearchOption[] = emptyLabel !== undefined && !q ? [{ id: "", label: emptyLabel }, ...matches] : matches;
  const selected = options.find((o) => o.id === value);

  const pick = (o: SearchOption) => {
    if (o.disabled) return;
    onChange(o.id);
    close();
  };

  const move = (step: number) => {
    if (!items.length) return;
    let i = active;
    for (let n = 0; n < items.length; n++) {
      i = (i + step + items.length) % items.length;
      if (!items[i].disabled) break;
    }
    setActive(i);
    listRef.current?.children[i]?.scrollIntoView({ block: "nearest" });
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      move(e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "Enter") {
      e.preventDefault(); // jangan submit form modal
      if (items[active]) pick(items[active]);
    } else if (e.key === "Escape") {
      e.stopPropagation(); // tutup menu saja, bukan modal
      close();
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() =>
          open
            ? close()
            : (setOpen(true),
              setActive(
                Math.max(
                  0,
                  items.findIndex((o) => o.id === value),
                ),
              ))
        }
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={label}
        className={`w-full text-left text-xs bg-panel-inset border border-line-strong rounded-lg py-2 pl-3 pr-8 focus:outline-none focus:border-cyan-400 relative truncate ${
          selected ? "text-slate-200" : "text-slate-400"
        }`}
      >
        {selected ? selected.label : value === "" && emptyLabel ? emptyLabel : placeholder}
        <Icon name="expand_more" className="absolute right-2 top-1/2 -translate-y-1/2 text-[16px] text-slate-400" />
      </button>
      <BodyPortal>
        <AnimatePresence>
          {open && pos && (
            <m.div
              {...DROP}
              initial={{ ...DROP.initial, y: pos.up ? 6 : -6 }}
              ref={menuRef}
              style={{ ...pos.style, transformOrigin: pos.up ? "bottom" : "top" }}
              className="z-[70] flex flex-col rounded-xl border border-line-strong bg-panel shadow-2xl overflow-hidden"
            >
              <div className="p-2 border-b border-line relative flex-shrink-0">
                <Icon name="search" className="absolute left-4 top-1/2 -translate-y-1/2 text-[15px] text-gray-500 pointer-events-none" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => (setQuery(e.target.value), setActive(0))}
                  onKeyDown={onKey}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  aria-controls={listId}
                  className="w-full bg-panel-inset border border-line rounded-lg text-xs text-gray-200 placeholder-gray-500 pl-8 pr-3 py-1.5 focus:outline-none focus:border-cyan-400"
                />
              </div>
              <ul ref={listRef} id={listId} role="listbox" className="max-h-64 min-h-0 overflow-y-auto overscroll-contain p-1.5">
                {items.map((o, i) => (
                  <li key={o.id || "__empty"} role="option" aria-selected={o.id === value} aria-disabled={o.disabled || undefined}>
                    <button
                      type="button"
                      disabled={o.disabled}
                      onClick={() => pick(o)}
                      onMouseEnter={() => setActive(i)}
                      className={`w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs disabled:opacity-40 disabled:cursor-not-allowed ${
                        i === active && !o.disabled ? "bg-panel-raised text-ink" : "text-gray-200"
                      } ${o.id === "" ? "italic text-gray-400" : ""}`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{o.label}</span>
                        {o.sub && <span className="block truncate text-[10px] text-gray-500">{o.sub}</span>}
                      </span>
                      {o.disabled && <span className="text-[9px] text-gray-500 flex-shrink-0">sudah dipakai</span>}
                      {o.id === value && !o.disabled && <Icon name="check" className="text-[15px] text-cyan-300 flex-shrink-0" />}
                    </button>
                  </li>
                ))}
                {items.length === 0 && <li className="px-2.5 py-3 text-xs text-gray-500 text-center">Karyawan tidak ditemukan</li>}
              </ul>
            </m.div>
          )}
        </AnimatePresence>
      </BodyPortal>
    </div>
  );
}
