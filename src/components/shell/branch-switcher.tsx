"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { AnimatePresence, m } from "motion/react";
import { Icon } from "@/components/icon";
import { DROP } from "@/components/motion";
import { useDismiss } from "@/components/use-dismiss";
import { setActiveBranch } from "@/lib/actions/branch";
import type { BranchSummary } from "@/lib/data/shell";
import { BRANCH_TYPE_LABEL } from "@/lib/labels";

const STATUS_DOT: Record<BranchSummary["status"], string> = {
  aktif: "bg-emerald-400",
  maintenance: "bg-amber-400",
  nonaktif: "bg-gray-500",
};

/**
 * Pemilih cabang aktif di topbar. Menu sendiri (bukan <select> native) supaya daftar
 * cabang tampil sesuai tema, dengan kode, nama, tipe, dan pencarian.
 */
export function BranchSwitcher({
  branches,
  activeId,
}: {
  branches: BranchSummary[];
  activeId: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  useDismiss(open, rootRef, () => setOpen(false));
  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  if (branches.length === 0) {
    return (
      <span className="flex items-center gap-2 bg-panel-raised border border-line-strong rounded-full px-3.5 py-1.5 ml-1 text-xs font-semibold text-gray-400">
        <span className="w-3 h-3 rounded-full bg-gray-600" />
        Belum ada cabang
      </span>
    );
  }

  const active = branches.find((b) => b.id === activeId) ?? null;
  const q = query.trim().toLowerCase();
  const shown = q
    ? branches.filter((b) => b.code.toLowerCase().includes(q) || b.name.toLowerCase().includes(q))
    : branches;

  const choose = (id: string) => {
    setOpen(false);
    setQuery("");
    if (id !== activeId) startTransition(() => setActiveBranch(id));
  };

  return (
    <div ref={rootRef} className="relative ml-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label="Pilih cabang aktif"
        className={`flex items-center gap-2 bg-panel-raised border rounded-full pl-3.5 pr-2.5 py-1.5 transition cursor-pointer text-xs font-semibold text-gray-200 ${
          open ? "border-cyan-400" : "border-line-strong hover:border-cyan-500/50"
        } ${pending ? "opacity-60" : ""}`}
      >
        <span className="w-3 h-3 rounded-full bg-gradient-to-tr from-amber-400 to-orange-500 shadow-[0_0_8px_rgba(245,158,11,0.6)] flex-shrink-0" />
        <span className="max-w-[220px] truncate">{active ? `${active.code} - ${active.name}` : "Pilih cabang"}</span>
        {pending ? (
          <span className="w-3.5 h-3.5 rounded-full border-2 border-gray-400 border-t-transparent animate-spin" />
        ) : (
          <Icon name="expand_more" className={`text-[16px] text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <m.div {...DROP} className="absolute left-0 top-full mt-2 z-50 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-line-strong bg-panel shadow-2xl shadow-black/40 overflow-hidden">
            {branches.length > 6 && (
              <div className="p-2 border-b border-line">
                <div className="relative">
                  <Icon name="search" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-gray-500" />
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Cari kode / nama cabang..."
                    className="w-full bg-panel-inset border border-line rounded-lg text-xs text-gray-200 placeholder-gray-500 pl-8 pr-3 py-1.5 focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>
            )}
            <ul id={listId} role="listbox" aria-label="Daftar cabang" className="max-h-72 overflow-y-auto p-1.5">
              {shown.map((b) => {
                const selected = b.id === activeId;
                return (
                  <li key={b.id} role="option" aria-selected={selected}>
                    <button
                      type="button"
                      onClick={() => choose(b.id)}
                      className={`w-full flex items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors ${
                        selected ? "bg-cyan-500/10" : "hover:bg-panel-raised"
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[b.status]}`} title={b.status} />
                      <span className="min-w-0 flex-1">
                        <span className={`block text-xs font-semibold truncate ${selected ? "text-brand-ink" : "text-gray-200"}`}>
                          {b.code} <span className="font-normal text-gray-400">· {b.name}</span>
                        </span>
                        <span className="block text-[10px] text-gray-500 mt-0.5">{BRANCH_TYPE_LABEL[b.branch_type]}</span>
                      </span>
                      {selected && <Icon name="check" className="text-[16px] text-brand-ink" />}
                    </button>
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
