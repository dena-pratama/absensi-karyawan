import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Icon } from "@/components/icon";
import { PageBody, PageHeader } from "@/components/shell/page-layout";
import { getReportData, getReportOptions, type ReportData } from "@/lib/data/report";
import { formatDateLong, formatDateSlash, todayWIB } from "@/lib/format";
import { ATTENDANCE_LABEL, type AttendanceStatus } from "@/lib/labels";
import { parseReportFilters, reportQuery } from "@/lib/report-filters";
import { LaporanTabs } from "./_components/laporan-tabs";
import { ReportFilter } from "./report-filter";

export const metadata: Metadata = { title: "Laporan Absensi" };

const PREVIEW_ROWS = 50;

export default function LaporanPage({ searchParams }: PageProps<"/laporan">) {
  return (
    <>
      <PageHeader
        crumb="Absensi Ekspedisi"
        current="Laporan Kehadiran"
        title="Tarik Data Laporan Kehadiran"
        below={<LaporanTabs active="kehadiran" />}
      />
      <PageBody>
        <Suspense fallback={<Skeleton />}>
          <Content searchParams={searchParams} />
        </Suspense>
      </PageBody>
    </>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/laporan">["searchParams"] }) {
  const params = await searchParams;
  // Filter default memakai tanggal hari ini (new Date) → tunda sampai request sungguhan,
  // jangan ikut di-prerender. (Halaman lain aman karena query Supabase sudah memanggil connection() lebih dulu.)
  await connection();
  const { error, ...filters } = parseReportFilters(params);
  const options = await getReportOptions();
  const data = await getReportData(filters, options);
  const qs = reportQuery(filters);

  return (
    <>
      <ReportFilter key={qs} options={options} filters={filters} today={todayWIB()} />
      {error && (
        <p role="alert" className="text-xs text-amber-300 bg-amber-950/30 border border-amber-500/30 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
      <Preview data={data} qs={qs} />
    </>
  );
}

const PILL: Record<AttendanceStatus, string> = {
  hadir: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  sakit: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  tidak_hadir: "bg-rose-500/10 text-rose-400 border-rose-500/30",
};

function Preview({ data, qs }: { data: ReportData; qs: string }) {
  const { totals, filters } = data;
  const pct = (n: number) => (totals.total ? `${Math.round((n / totals.total) * 1000) / 10}%` : "–");
  const empty = data.rows.length === 0;
  const download =
    "flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-xs font-medium transition aria-disabled:opacity-40 aria-disabled:pointer-events-none";

  return (
    <>
      {/* Header hasil + unduh */}
      <section aria-labelledby="hasil-title" className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
        <div>
          <h2 id="hasil-title" className="text-lg font-bold text-ink">
            Hasil Laporan
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {data.branchLabel} • {data.employeeLabel} • {formatDateSlash(filters.from)} s/d {formatDateSlash(filters.to)}
            {filters.status ? ` • ${ATTENDANCE_LABEL[filters.status]}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/laporan/export/csv?${qs}&jenis=detail`}
            aria-disabled={empty}
            className={`${download} bg-panel-raised border-line-strong text-gray-200 hover:text-brand-ink hover:border-brand/40`}
          >
            <Icon name="table_view" className="text-[16px] text-emerald-400" />
            CSV Detail Harian
          </a>
          <a
            href={`/laporan/export/csv?${qs}&jenis=rekap`}
            aria-disabled={empty}
            className={`${download} bg-panel-raised border-line-strong text-gray-200 hover:text-brand-ink hover:border-brand/40`}
          >
            <Icon name="summarize" className="text-[16px] text-emerald-400" />
            CSV Rekap Karyawan
          </a>
          <a
            href={`/laporan/export/pdf?${qs}`}
            aria-disabled={empty}
            className={`${download} bg-brand border-brand text-black font-semibold shadow-[0_0_15px_rgba(0,210,255,0.25)] hover:bg-brand/90`}
          >
            <Icon name="picture_as_pdf" className="text-[16px]" />
            Unduh PDF
          </a>
        </div>
      </section>

      {/* Ringkasan */}
      <section aria-label="Ringkasan laporan" className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Tile label="Karyawan" value={totals.employees} sub={`${totals.days} hari tercatat`} dot="bg-cyan-400" />
        <Tile label="Total Data" value={totals.total} sub="baris absensi" dot="bg-sky-400" />
        <Tile label="Hadir" value={totals.hadir} sub={pct(totals.hadir)} dot="bg-emerald-400" />
        <Tile label="Sakit" value={totals.sakit} sub={pct(totals.sakit)} dot="bg-amber-400" />
        <Tile label="Tidak Hadir" value={totals.tidakHadir} sub={pct(totals.tidakHadir)} dot="bg-rose-400" />
      </section>

      {empty ? (
        <div className="rounded-2xl border border-dashed border-line-strong bg-panel p-10 text-center text-sm text-gray-300">
          Tidak ada data absensi untuk filter ini.
        </div>
      ) : (
        <>
          {/* Rekap per karyawan */}
          <section aria-labelledby="rekap-title" className="bg-panel border border-line rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-line">
              <h3 id="rekap-title" className="text-sm font-bold text-ink">
                Rekap per Karyawan
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse min-w-[720px]">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-gray-400 border-b border-line">
                    <th scope="col" className="py-2.5 px-5 font-semibold">NIK</th>
                    <th scope="col" className="py-2.5 px-4 font-semibold">Nama &amp; Jabatan</th>
                    <th scope="col" className="py-2.5 px-4 font-semibold">Cabang</th>
                    <th scope="col" className="py-2.5 px-3 font-semibold text-center text-emerald-400">H</th>
                    <th scope="col" className="py-2.5 px-3 font-semibold text-center text-amber-400">S</th>
                    <th scope="col" className="py-2.5 px-3 font-semibold text-center text-rose-400">TH</th>
                    <th scope="col" className="py-2.5 px-3 font-semibold text-center">Total</th>
                    <th scope="col" className="py-2.5 px-5 font-semibold text-right">% Hadir</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line tabular-nums">
                  {data.employees.map((e) => (
                    <tr key={e.employeeId} className="hover:bg-panel-raised/50">
                      <td className="py-2.5 px-5 font-mono text-gray-400">{e.nik}</td>
                      <td className="py-2.5 px-4">
                        <div className="font-semibold text-ink">{e.name}</div>
                        <div className="text-[10px] text-cyan-400">{e.role}</div>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-gray-300">{e.branches}</td>
                      <td className="py-2.5 px-3 text-center text-emerald-400 font-semibold">{e.hadir}</td>
                      <td className="py-2.5 px-3 text-center text-amber-400">{e.sakit}</td>
                      <td className="py-2.5 px-3 text-center text-rose-400">{e.tidakHadir}</td>
                      <td className="py-2.5 px-3 text-center text-gray-200">{e.total}</td>
                      <td className="py-2.5 px-5 text-right font-bold text-ink">{e.percent === null ? "–" : `${e.percent}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Detail harian */}
          <section aria-labelledby="detail-title" className="bg-panel border border-line rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-line flex flex-wrap items-center justify-between gap-2">
              <h3 id="detail-title" className="text-sm font-bold text-ink">
                Detail Harian
              </h3>
              <span className="text-[11px] text-gray-400">
                {data.rows.length > PREVIEW_ROWS
                  ? `Pratinjau ${PREVIEW_ROWS} dari ${data.rows.length} baris. Unduh CSV/PDF untuk data lengkap.`
                  : `${data.rows.length} baris`}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse min-w-[820px]">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-gray-400 border-b border-line">
                    <th scope="col" className="py-2.5 px-5 font-semibold">Tanggal</th>
                    <th scope="col" className="py-2.5 px-4 font-semibold">Cabang</th>
                    <th scope="col" className="py-2.5 px-4 font-semibold">NIK</th>
                    <th scope="col" className="py-2.5 px-4 font-semibold">Nama &amp; Jabatan</th>
                    <th scope="col" className="py-2.5 px-4 font-semibold">Status</th>
                    <th scope="col" className="py-2.5 px-5 font-semibold">Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.rows.slice(0, PREVIEW_ROWS).map((r) => (
                    <tr key={`${r.employeeId}-${r.date}`} className="hover:bg-panel-raised/50">
                      <td className="py-2.5 px-5 text-gray-300 whitespace-nowrap">{formatDateLong(r.date)}</td>
                      <td className="py-2.5 px-4 font-mono text-gray-300">{r.branchCode}</td>
                      <td className="py-2.5 px-4 font-mono text-gray-400">{r.nik}</td>
                      <td className="py-2.5 px-4">
                        <div className="font-semibold text-ink">{r.name}</div>
                        <div className="text-[10px] text-gray-400">{r.role}</div>
                      </td>
                      <td className="py-2.5 px-4">
                        <span className={`px-2 py-0.5 rounded-full border text-[11px] whitespace-nowrap ${PILL[r.status]}`}>
                          {ATTENDANCE_LABEL[r.status]}
                        </span>
                      </td>
                      <td className="py-2.5 px-5 text-gray-400 italic">{r.note || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}

function Tile({ label, value, sub, dot }: { label: string; value: number; sub: string; dot: string }) {
  return (
    <div className="bg-panel border border-line rounded-2xl p-4 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
        {label}
      </div>
      <div className="text-2xl font-semibold text-ink tabular-nums">{value}</div>
      <div className="text-[10px] text-gray-400">{sub}</div>
    </div>
  );
}

function Skeleton() {
  const block = "rounded-2xl bg-panel border border-line animate-pulse";
  return (
    <>
      <div className={`${block} h-40`} />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={`${block} h-24`} />
        ))}
      </div>
      <div className={`${block} h-80`} />
    </>
  );
}
