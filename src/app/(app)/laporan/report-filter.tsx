"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DateInput } from "@/components/date-input";
import { Icon } from "@/components/icon";
import type { ReportOptions } from "@/lib/data/report";
import { reportQuery, type ReportFilters } from "@/lib/report-filters";

const control =
  "w-full bg-panel border border-line rounded-lg text-xs text-gray-200 py-2 px-3 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all";

function Label({ children }: { children: React.ReactNode }) {
  return <span className="block text-[11px] font-medium text-gray-400 mb-1">{children}</span>;
}

export function ReportFilter({
  options,
  filters,
  today,
}: {
  options: ReportOptions;
  filters: ReportFilters;
  today: string;
}) {
  const router = useRouter();
  const [f, setF] = useState(filters);
  const [pending, startTransition] = useTransition();

  // Karyawan disaring sesuai cabang penempatan saat ini.
  const employees = f.branchId ? options.employees.filter((e) => e.branchId === f.branchId) : options.employees;
  const changed = reportQuery(f) !== reportQuery(filters);

  const submit = () => startTransition(() => router.push(`/laporan?${reportQuery(f)}`));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="bg-panel border border-line rounded-2xl p-5 flex flex-col gap-4"
    >
      <div className="flex items-center gap-2">
        <Icon name="filter_alt" className="text-[18px] text-cyan-400" />
        <h2 className="text-sm font-bold text-ink">Filter Laporan</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
        <label>
          <Label>Cabang</Label>
          <select
            className={control}
            value={f.branchId}
            onChange={(e) => {
              const branchId = e.target.value;
              const keep = !branchId || options.employees.find((x) => x.id === f.employeeId)?.branchId === branchId;
              setF({ ...f, branchId, employeeId: keep ? f.employeeId : "" });
            }}
          >
            <option value="">Semua Cabang</option>
            {options.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <Label>Karyawan</Label>
          <select className={control} value={f.employeeId} onChange={(e) => setF({ ...f, employeeId: e.target.value })}>
            <option value="">Semua Karyawan</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <Label>Dari Tanggal</Label>
          <DateInput
            className={control}
            value={f.from}
            max={f.to}
            onChange={(e) => e.target.value && setF({ ...f, from: e.target.value })}
          />
        </label>
        <label>
          <Label>Sampai Tanggal</Label>
          <DateInput
            className={control}
            value={f.to}
            min={f.from}
            max={today}
            onChange={(e) => e.target.value && setF({ ...f, to: e.target.value })}
          />
        </label>
        <label>
          <Label>Status</Label>
          <select className={control} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as ReportFilters["status"] })}>
            <option value="">Semua Status</option>
            <option value="hadir">Hadir</option>
            <option value="sakit">Sakit</option>
            <option value="tidak_hadir">Tidak Hadir</option>
          </select>
        </label>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-[11px] text-gray-500">
          Cabang = tempat absensi dicatat. Daftar karyawan mengikuti cabang penempatan saat ini.
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="submit"
            disabled={pending}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg border transition disabled:opacity-60 ${
              changed
                ? "bg-brand border-brand text-black font-semibold shadow-[0_0_15px_rgba(0,210,255,0.25)]"
                : "bg-panel-raised border-line-strong text-gray-200 hover:border-brand/40"
            }`}
          >
            {pending ? (
              <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
            ) : (
              <Icon name="search" className="text-[16px]" />
            )}
            Tampilkan
          </button>
        </div>
      </div>
    </form>
  );
}
