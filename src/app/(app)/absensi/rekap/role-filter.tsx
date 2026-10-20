"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";

export function RoleFilter({
  roles,
  value,
  month,
}: {
  roles: { id: string; name: string }[];
  value: string;
  month: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="text-slate-400">Filter Role:</span>
      <span className="relative">
        <select
          value={value}
          disabled={pending}
          onChange={(e) => {
            const role = e.target.value;
            startTransition(() => router.push(`/absensi/rekap?bulan=${month}${role ? `&role=${role}` : ""}`));
          }}
          className="appearance-none bg-panel-inset border border-slate-700/60 rounded-xl pl-3 pr-7 py-1 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer disabled:opacity-60"
        >
          <option value="">Semua Role</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <Icon name="expand_more" className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[15px] text-slate-400 pointer-events-none" />
      </span>
    </label>
  );
}
