"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icon";
import type { KasbonItem, getKasbonReport } from "@/lib/data/kasbon";
import { formatDateShort, formatRupiah } from "@/lib/format";
import { buildKasbonReport, effectiveStatus as effective, kasbonFilterQuery } from "@/lib/kasbon-report";
import { KASBON_STATUS_LABEL, type KasbonStatus } from "@/lib/labels";
import { Pagination, filterCls } from "../../pengaturan/_components/ui";

type Report = Awaited<ReturnType<typeof getKasbonReport>>;
type Option = { id: string; label: string };
type EmployeeOption = Option & { branchId: string };
type View = "karyawan" | "detail";

const PER_PAGE = 15;

const PILL: Record<KasbonStatus, string> = {
  diajukan: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  disetujui: "bg-cyan-500/10 text-cyan-300 border-cyan-500/30",
  ditolak: "bg-rose-500/10 text-rose-300 border-rose-500/30",
  dicairkan: "bg-purple-500/10 text-purple-300 border-purple-500/30",
  lunas: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  dibatalkan: "bg-panel-raised text-gray-400 border-line-strong",
};

const periodLabel = (start: string, end: string) => `${formatDateShort(start)} s/d ${formatDateShort(end)}`;
const stampDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric" }) : "";

/** CSV untuk Excel (BOM UTF-8, pemisah koma), sama seperti ekspor laporan kehadiran. */
function downloadCsv(name: string, rows: (string | number)[][]) {
  const cell = (v: string | number) => (typeof v === "number" ? String(v) : /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const blob = new Blob(["﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

export function KasbonReport({ report, branches, employees }: { report: Report; branches: Option[]; employees: EmployeeOption[] }) {
  if (!report.ready) {
    return (
      <div role="alert" className="rounded-2xl border border-amber-500/40 bg-amber-950/30 p-4 text-xs text-amber-200 flex gap-3">
        <Icon name="warning" className="text-[20px] text-amber-400 flex-shrink-0" />
        <p>
          Fitur kasbon belum aktif. Jalankan <code className="font-mono">supabase/migrations/20261025000000_kasbon.sql</code> di SQL Editor Supabase.
        </p>
      </div>
    );
  }
  return <ReportView items={report.items} currentPeriod={report.currentPeriod} branches={branches} employees={employees} />;
}

function ReportView({
  items,
  currentPeriod,
  branches,
  employees,
}: {
  items: KasbonItem[];
  currentPeriod: { start: string; end: string } | null;
  branches: Option[];
  employees: EmployeeOption[];
}) {
  // Periode yang tersedia: periode berjalan + semua periode yang punya kasbon, terbaru dulu
  const periods = [
    ...new Map(
      [...(currentPeriod ? [currentPeriod] : []), ...items.map((k) => ({ start: k.periodStart, end: k.periodEnd }))].map((p) => [p.start, p]),
    ).values(),
  ].sort((a, b) => b.start.localeCompare(a.start));

  const [period, setPeriod] = useState(currentPeriod?.start ?? "");
  const [branch, setBranch] = useState("");
  const [status, setStatus] = useState<"" | KasbonStatus>("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("karyawan");
  const [page, setPage] = useState(1);

  const branchOf = new Map(employees.map((e) => [e.id, e.branchId]));
  const branchCode = new Map(branches.map((b) => [b.id, b.label.split(" - ")[0]]));
  const filters = { period, branch, status, q: query };
  const { filtered, totals, recap } = buildKasbonReport(items, filters, branchOf, branchCode);

  const rows = view === "karyawan" ? recap.length : filtered.length;
  const pages = Math.max(1, Math.ceil(rows / PER_PAGE));
  const current = Math.min(page, pages);
  const slice = <T,>(list: T[]) => list.slice((current - 1) * PER_PAGE, current * PER_PAGE);
  const reset = () => setPage(1);

  const periodName = period ? periods.find((p) => p.start === period) : null;
  const fileTag = periodName ? `${periodName.start}_${periodName.end}` : "semua-periode";

  const exportCsv = () =>
    view === "karyawan"
      ? downloadCsv(`rekap-kasbon_${fileTag}.csv`, [
          ["NIK", "Nama", "Cabang", "Jumlah Kasbon", "Total Diajukan", "Total Dicairkan", "Belum Dipotong Gaji"],
          ...recap.map((r) => [r.nik, r.name, r.branch, r.count, r.requested, r.disbursed, r.open]),
        ])
      : downloadCsv(`detail-kasbon_${fileTag}.csv`, [
          ["Tanggal Diajukan", "NIK", "Nama", "Cabang", "Periode Mulai", "Periode Selesai", "Nominal", "Plafon", "HK", "Status", "Dicairkan", "Keperluan", "Catatan Admin"],
          ...filtered.map((k) => [
            stampDate(k.requestedAt),
            k.nik,
            k.name,
            branchCode.get(branchOf.get(k.employeeId) ?? "") ?? "-",
            k.periodStart,
            k.periodEnd,
            k.amount,
            k.plafon,
            k.hk,
            KASBON_STATUS_LABEL[effective(k)] + (k.autoSettled ? " (potong gaji)" : ""),
            stampDate(k.disbursedAt),
            k.note ?? "",
            k.decisionNote ?? "",
          ]),
        ]);

  return (
    <>
      <section aria-label="Filter laporan kasbon" className="bg-panel border border-line rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center gap-2 text-xs">
        <select value={period} onChange={(e) => (setPeriod(e.target.value), reset())} aria-label="Periode gajian" className={`${filterCls} py-2 px-3`}>
          {periods.map((p) => (
            <option key={p.start} value={p.start}>
              {p.start === currentPeriod?.start ? "Periode berjalan · " : ""}
              {periodLabel(p.start, p.end)}
            </option>
          ))}
          <option value="">Semua periode</option>
        </select>
        <select value={branch} onChange={(e) => (setBranch(e.target.value), reset())} aria-label="Filter cabang" className={`${filterCls} py-2 px-3`}>
          <option value="">Semua cabang</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => (setStatus(e.target.value as "" | KasbonStatus), reset())} aria-label="Filter status" className={`${filterCls} py-2 px-3`}>
          <option value="">Semua status</option>
          {(Object.keys(KASBON_STATUS_LABEL) as KasbonStatus[]).map((s) => (
            <option key={s} value={s}>
              {KASBON_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <div className="relative lg:flex-1 lg:max-w-xs">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-gray-500 pointer-events-none" />
          <input
            value={query}
            onChange={(e) => (setQuery(e.target.value), reset())}
            placeholder="Cari nama atau NIK..."
            aria-label="Cari karyawan"
            className={`${filterCls} w-full pl-9 pr-3 py-2 placeholder-gray-500`}
          />
        </div>
        <div className="lg:ml-auto flex gap-2">
          <button
            type="button"
            onClick={exportCsv}
            disabled={rows === 0}
            className="flex-1 lg:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 font-medium transition disabled:opacity-40 disabled:pointer-events-none"
          >
            <Icon name="download" className="text-[16px]" />
            Unduh CSV
          </button>
          {/* PDF dibuat di server dengan filter yang sama (rekap per karyawan + detail). */}
          <a
            href={`/laporan/kasbon/export/pdf?${kasbonFilterQuery(filters)}`}
            aria-disabled={filtered.length === 0}
            className="flex-1 lg:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg border border-brand bg-brand text-black font-semibold shadow-[0_0_15px_rgba(0,210,255,0.25)] hover:bg-brand/90 transition aria-disabled:opacity-40 aria-disabled:pointer-events-none"
          >
            <Icon name="picture_as_pdf" className="text-[16px]" />
            Unduh PDF
          </a>
        </div>
      </section>

      <section aria-label="Ringkasan kasbon" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total kasbon", value: totals.requested, note: `${totals.count} pengajuan · ${recap.length} karyawan`, tone: "text-ink" },
          { label: "Menunggu proses", value: totals.waiting, note: "diajukan & disetujui", tone: "text-amber-300" },
          { label: "Sudah dicairkan", value: totals.disbursed, note: "dicairkan & lunas", tone: "text-purple-300" },
          { label: "Belum dipotong gaji", value: totals.open, note: "dipotong di akhir periode", tone: "text-brand-ink" },
        ].map((s) => (
          <div key={s.label} className="bg-panel border border-line rounded-2xl p-4">
            <div className="text-[11px] text-gray-400">{s.label}</div>
            <div className={`text-xl font-bold mt-1 tabular-nums ${s.tone}`}>{formatRupiah(s.value)}</div>
            <div className="text-[10px] text-gray-500 mt-0.5">{s.note}</div>
          </div>
        ))}
      </section>

      <section aria-labelledby="laporan-kasbon-title" className="bg-panel border border-line rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-line flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 id="laporan-kasbon-title" className="text-sm font-bold text-ink">
              {view === "karyawan" ? "Rekap per Karyawan" : "Detail Kasbon"}
            </h2>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {periodName ? `Periode ${periodLabel(periodName.start, periodName.end)}` : "Semua periode"}. Kasbon ditolak / dibatalkan tidak dihitung di rekap.{" "}
              <Link href="/kasbon" className="text-brand-ink underline underline-offset-2">
                Proses pengajuan
              </Link>
            </p>
          </div>
          <div className="flex items-center gap-1 bg-panel-inset p-1 rounded-xl border border-line self-start text-xs" role="group" aria-label="Tampilan">
            {(["karyawan", "detail"] as View[]).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => (setView(v), reset())}
                className={`px-3 py-1.5 rounded-lg transition ${view === v ? "bg-cyan-500/15 text-cyan-300 font-semibold" : "text-gray-400 hover:text-gray-200"}`}
              >
                {v === "karyawan" ? "Per Karyawan" : "Detail"}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          {view === "karyawan" ? (
            <table className="w-full text-left text-xs border-collapse min-w-[720px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-gray-400 border-b border-line">
                  <th scope="col" className="py-3 px-5 font-semibold">Karyawan</th>
                  <th scope="col" className="py-3 px-4 font-semibold">Cabang</th>
                  <th scope="col" className="py-3 px-4 font-semibold text-right">Jumlah</th>
                  <th scope="col" className="py-3 px-4 font-semibold text-right">Total Diajukan</th>
                  <th scope="col" className="py-3 px-4 font-semibold text-right">Dicairkan</th>
                  <th scope="col" className="py-3 px-5 font-semibold text-right">Belum Dipotong</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {slice(recap).map((r) => (
                  <tr key={r.employeeId} className="hover:bg-panel-raised/40">
                    <td className="py-3 px-5">
                      <div className="text-gray-100 font-medium">{r.name}</div>
                      <div className="text-[10px] text-gray-500 font-mono">{r.nik}</div>
                    </td>
                    <td className="py-3 px-4 text-gray-300 font-mono">{r.branch}</td>
                    <td className="py-3 px-4 text-right text-gray-300 tabular-nums">{r.count}×</td>
                    <td className="py-3 px-4 text-right text-gray-100 font-semibold tabular-nums">{formatRupiah(r.requested)}</td>
                    <td className="py-3 px-4 text-right text-purple-300 tabular-nums">{formatRupiah(r.disbursed)}</td>
                    <td className="py-3 px-5 text-right tabular-nums">
                      {r.open ? <span className="text-brand-ink">{formatRupiah(r.open)}</span> : <span className="text-gray-600">-</span>}
                    </td>
                  </tr>
                ))}
                {recap.length === 0 && <EmptyRow cols={6} />}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left text-xs border-collapse min-w-[860px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-gray-400 border-b border-line">
                  <th scope="col" className="py-3 px-5 font-semibold">Diajukan</th>
                  <th scope="col" className="py-3 px-4 font-semibold">Karyawan</th>
                  <th scope="col" className="py-3 px-4 font-semibold text-right">Nominal</th>
                  <th scope="col" className="py-3 px-4 font-semibold">Periode</th>
                  <th scope="col" className="py-3 px-4 font-semibold">Status</th>
                  <th scope="col" className="py-3 px-5 font-semibold">Keperluan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {slice(filtered).map((k) => {
                  const st = effective(k);
                  return (
                    <tr key={k.id} className="hover:bg-panel-raised/40">
                      <td className="py-3 px-5 text-gray-300 whitespace-nowrap">{stampDate(k.requestedAt)}</td>
                      <td className="py-3 px-4">
                        <div className="text-gray-100 font-medium">{k.name}</div>
                        <div className="text-[10px] text-gray-500 font-mono">{k.nik}</div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="text-gray-100 font-semibold tabular-nums">{formatRupiah(k.amount)}</div>
                        <div className="text-[10px] text-gray-500">
                          plafon {formatRupiah(k.plafon)} · {k.hk} HK
                        </div>
                      </td>
                      <td className="py-3 px-4 text-gray-400 whitespace-nowrap">{periodLabel(k.periodStart, k.periodEnd)}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-block px-2 py-0.5 rounded-full border text-[11px] font-semibold ${PILL[st]}`}>{KASBON_STATUS_LABEL[st]}</span>
                        {k.autoSettled && <div className="text-[10px] text-gray-500 mt-0.5">potong gaji</div>}
                      </td>
                      <td className="py-3 px-5 text-gray-400 max-w-[240px] truncate" title={k.note ?? undefined}>
                        {k.note ?? <span className="text-gray-600">-</span>}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && <EmptyRow cols={6} />}
              </tbody>
            </table>
          )}
        </div>
        {rows > 0 && (
          <div className="px-5 py-3 border-t border-line flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-400">
            <span>
              Menampilkan {(current - 1) * PER_PAGE + 1}-{Math.min(current * PER_PAGE, rows)} dari {rows} {view === "karyawan" ? "karyawan" : "kasbon"}
            </span>
            <Pagination page={current} pages={pages} onPage={setPage} />
          </div>
        )}
      </section>
    </>
  );
}

function EmptyRow({ cols }: { cols: number }) {
  return (
    <tr>
      <td colSpan={cols} className="py-10 text-center text-gray-400">
        Tidak ada kasbon pada filter ini.
      </td>
    </tr>
  );
}
