"use client";

import { useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { Icon } from "@/components/icon";
import { DROP } from "@/components/motion";
import { useDismiss } from "@/components/use-dismiss";

type Option = { id: string; label: string };

/** Pilih beberapa cabang (untuk SPV). Cabang pertama yang dipilih = cabang utama. */
export function BranchMultiPicker({
  value,
  options,
  onChange,
  label = "Cabang SPV",
}: {
  value: string[];
  options: Option[];
  onChange: (ids: string[]) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useDismiss(open, ref, () => setOpen(false));

  const labelOf = new Map(options.map((o) => [o.id, o.label]));
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  const q = query.trim().toLowerCase();
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  const summary =
    value.length === 0
      ? "Pilih cabang…"
      : value.length === 1
        ? (labelOf.get(value[0]) ?? "1 cabang")
        : `${labelOf.get(value[0])?.split(" - ")[0] ?? ""} + ${value.length - 1} cabang lain`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        className="w-full text-left text-xs bg-panel-inset border border-line-strong text-slate-200 rounded-lg py-2 pl-3 pr-8 focus:outline-none focus:border-cyan-400 relative truncate"
      >
        {summary}
        <Icon name="expand_more" className="absolute right-2 top-1/2 -translate-y-1/2 text-[16px] text-slate-400" />
      </button>
      <AnimatePresence>
        {open && (
          <m.div {...DROP} className="absolute z-30 mt-1 w-72 max-w-[80vw] rounded-xl border border-line-strong bg-panel shadow-2xl overflow-hidden">
            {options.length > 6 && (
              <div className="p-2 border-b border-line">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Cari cabang..."
                  aria-label="Cari cabang"
                  className="w-full bg-panel-inset border border-line rounded-lg text-xs text-gray-200 placeholder-gray-500 px-3 py-1.5 focus:outline-none focus:border-cyan-400"
                />
              </div>
            )}
            <ul role="listbox" aria-multiselectable="true" className="max-h-60 overflow-y-auto p-1.5">
              {shown.map((o) => {
                const checked = value.includes(o.id);
                return (
                  <li key={o.id} role="option" aria-selected={checked}>
                    <label className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 hover:bg-panel-raised cursor-pointer">
                      <input type="checkbox" checked={checked} onChange={() => toggle(o.id)} className="accent-cyan-400" />
                      <span className="truncate">{o.label}</span>
                      {value[0] === o.id && <span className="ml-auto text-[9px] text-cyan-300 flex-shrink-0">utama</span>}
                    </label>
                  </li>
                );
              })}
              {shown.length === 0 && <li className="px-2.5 py-3 text-xs text-gray-500 text-center">Cabang tidak ditemukan</li>}
            </ul>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
