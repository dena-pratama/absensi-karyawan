"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/icon";
import { initials } from "@/lib/format";
import { ATTENDANCE_LABEL, type AttendanceStatus } from "@/lib/labels";

export type EmployeeListRow = {
  employeeId: string;
  nik: string;
  name: string;
  phone: string | null;
  contract: "tetap" | "pkwt" | "mitra";
  roleId: string;
  roleName: string;
  month: { hadir: number; sakit: number; tidakHadir: number; total: number; percent: number | null };
  todayStatus: AttendanceStatus | null;
};

const CONTRACT: Record<EmployeeListRow["contract"], { label: string; cls: string }> = {
  tetap: { label: "Tetap", cls: "bg-cyan-500/10 text-cyan-300 border-cyan-500/30" },
  pkwt: { label: "PKWT", cls: "bg-purple-500/10 text-purple-300 border-purple-500/30" },
  mitra: { label: "Mitra", cls: "bg-amber-500/10 text-amber-300 border-amber-500/30" },
};

const TODAY: Record<string, { cls: string; dot: string }> = {
  hadir: { cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30", dot: "bg-emerald-400" },
  sakit: { cls: "bg-amber-500/10 text-amber-400 border-amber-500/30", dot: "bg-amber-400" },
  tidak_hadir: { cls: "bg-rose-500/10 text-rose-400 border-rose-500/30", dot: "bg-rose-400" },
  belum: { cls: "bg-gray-500/10 text-gray-400 border-gray-500/30", dot: "bg-gray-500" },
};

/** "+6281234567890" → "+62 812-3456-7890" */
function formatPhone(phone: string | null) {
  if (!phone) return "-";
  const local = phone.replace(/^\+62/, "");
  return `+62 ${local.slice(0, 3)}-${local.slice(3, 7)}-${local.slice(7)}`;
}

function barTone(p: number) {
  if (p >= 95) return "bg-cyan-400";
  if (p >= 85) return "bg-amber-400";
  return "bg-rose-400";
}

const control =
  "bg-panel border border-line rounded-lg text-xs text-gray-200 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all";

export function EmployeeTable({
  rows,
  roles,
  initialQuery,
  monthLabel,
}: {
  rows: EmployeeListRow[];
  roles: { id: string; name: string }[];
  initialQuery: string;
  monthLabel: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [roleId, setRoleId] = useState("");
  const q = query.trim().toLowerCase();
  const visible = rows.filter(
    (r) =>
      (!roleId || r.roleId === roleId) &&
      (!q || r.name.toLowerCase().includes(q) || r.nik.toLowerCase().includes(q) || r.roleName.toLowerCase().includes(q)),
  );

  return (
    <section aria-label="Daftar karyawan" className="flex flex-col gap-4">
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 max-w-sm">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
            <Icon name="search" className="text-[16px]" />
          </div>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Cari staf"
            placeholder="Cari staf (nama, NIK, role)..."
            className={`${control} w-full pl-9 pr-3 py-1.5 placeholder-gray-500`}
          />
        </div>
        <label className="flex items-center gap-2">
          <span className="text-gray-400 shrink-0">Filter Role:</span>
          <span className="relative">
            <select
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              className={`${control} appearance-none text-gray-300 py-1.5 pl-3 pr-8 cursor-pointer`}
            >
              <option value="">Semua Role</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <Icon name="expand_more" className="absolute right-2 top-1/2 -translate-y-1/2 text-[16px] text-gray-400 pointer-events-none" />
          </span>
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-line bg-shell/60">
        <table className="w-full text-left text-xs border-collapse min-w-[860px]">
          <thead>
            <tr className="text-gray-400 bg-panel border-b border-line">
              <th scope="col" className="py-3 px-3 font-medium text-center w-12">No</th>
              <th scope="col" className="py-3 px-4 font-medium w-28">NIK / ID</th>
              <th scope="col" className="py-3 px-4 font-medium min-w-[200px]">Nama Karyawan &amp; Role</th>
              <th scope="col" className="py-3 px-4 font-medium">Kontak / No. HP</th>
              <th scope="col" className="py-3 px-4 font-medium">Status Kontrak</th>
              <th scope="col" className="py-3 px-4 font-medium min-w-[150px]">Kehadiran {monthLabel}</th>
              <th scope="col" className="py-3 px-4 font-medium">Hari Ini</th>
              <th scope="col" className="py-3 px-4 font-medium text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line text-gray-300">
            {visible.map((r, i) => {
              const today = TODAY[r.todayStatus ?? "belum"];
              const pct = r.month.percent;
              return (
                <tr key={r.employeeId} className="hover:bg-panel/60 transition-colors group">
                  <td className="py-3 px-3 text-center font-mono text-gray-500 group-hover:text-ink">
                    {String(i + 1).padStart(2, "0")}
                  </td>
                  <td className="py-3 px-4 font-mono text-gray-400 group-hover:text-ink">{r.nik}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2.5">
                      <span className="w-7 h-7 rounded-full ring-1 ring-cyan-500/20 bg-cyan-900/40 text-cyan-200 font-bold flex items-center justify-center text-[10px] flex-shrink-0">
                        {initials(r.name)}
                      </span>
                      <div className="flex flex-col min-w-0">
                        <span className="font-medium text-ink truncate">{r.name}</span>
                        <span className="text-[10px] text-cyan-400 truncate">{r.roleName}</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 font-mono text-gray-400 whitespace-nowrap">{formatPhone(r.phone)}</td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded-full border text-[11px] ${CONTRACT[r.contract].cls}`}>
                      {CONTRACT[r.contract].label}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    {pct === null ? (
                      <span className="text-gray-500">Belum ada data</span>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-baseline justify-between gap-2 tabular-nums">
                          <span className="font-bold text-ink">{Math.round(pct)}%</span>
                          <span className="text-[10px] text-gray-400">
                            {r.month.hadir}/{r.month.total} Hari
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-panel-raised overflow-hidden">
                          <div className={`h-full rounded-full ${barTone(pct)}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] whitespace-nowrap ${today.cls}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${today.dot}`} />
                      {r.todayStatus ? ATTENDANCE_LABEL[r.todayStatus] : "Belum Diabsen"}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <Link
                      href={`/absensi/karyawan/${r.employeeId}`}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-panel-raised hover:bg-panel-raised text-cyan-400 border border-cyan-500/30 rounded-lg text-[11px] font-medium transition"
                    >
                      Detail
                      <Icon name="chevron_right" className="text-[14px]" />
                    </Link>
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={8} className="py-10 text-center text-gray-400">
                  {rows.length === 0 ? "Belum ada karyawan di cabang ini." : "Tidak ada staf yang cocok dengan pencarian."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-gray-500">
        Menampilkan {visible.length} dari {rows.length} personil.
      </p>
    </section>
  );
}
