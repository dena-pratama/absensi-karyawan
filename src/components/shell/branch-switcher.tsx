"use client";

import { useTransition } from "react";
import { setActiveBranch } from "@/lib/actions/branch";
import type { BranchSummary } from "@/lib/data/shell";

export function BranchSwitcher({
  branches,
  activeId,
}: {
  branches: BranchSummary[];
  activeId: string | null;
}) {
  const [pending, startTransition] = useTransition();

  if (branches.length === 0) {
    return (
      <span className="flex items-center gap-2 bg-panel-raised border border-line-strong rounded-full px-3.5 py-1.5 ml-1 text-xs font-semibold text-gray-400">
        <span className="w-3 h-3 rounded-full bg-gray-600" />
        Belum ada cabang
      </span>
    );
  }

  return (
    <label
      className={`relative flex items-center gap-2 bg-panel-raised border border-line-strong hover:border-cyan-500/50 focus-within:border-cyan-400 rounded-full pl-3.5 pr-2.5 py-1.5 transition cursor-pointer ml-1 ${
        pending ? "opacity-60" : ""
      }`}
    >
      <span className="sr-only">Pilih cabang aktif</span>
      <span className="w-3 h-3 rounded-full bg-gradient-to-tr from-amber-400 to-orange-500 shadow-[0_0_8px_rgba(245,158,11,0.6)] flex-shrink-0" />
      <select
        value={activeId ?? ""}
        disabled={pending}
        onChange={(e) => {
          const id = e.target.value;
          startTransition(() => setActiveBranch(id));
        }}
        className="appearance-none bg-transparent text-xs font-semibold text-gray-200 pr-5 cursor-pointer focus:outline-none max-w-[220px] truncate"
      >
        {branches.map((b) => (
          <option key={b.id} value={b.id} className="bg-panel-raised">
            {b.code} - {b.name}
          </option>
        ))}
      </select>
      <svg
        className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 pointer-events-none"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
      </svg>
    </label>
  );
}
