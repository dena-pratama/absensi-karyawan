import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Icon } from "@/components/icon";
import { PageBody } from "@/components/shell/page-layout";
import { getJobRoles } from "@/lib/data/attendance";
import { getMonthlyRekap } from "@/lib/data/rekap";
import { getShellData } from "@/lib/data/shell";
import { formatMonthLong, initials, monthOf, parseMonthParam, shiftMonth, todayWIB } from "@/lib/format";
import type { AttendanceStatus } from "@/lib/labels";
import { AbsensiHeader } from "../_components/absensi-header";
import { RoleFilter } from "./role-filter";

export const metadata: Metadata = { title: "Rekap Bulanan" };

export default function RekapPage({ searchParams }: PageProps<"/absensi/rekap">) {
  return (
    <>
      <AbsensiHeader tab="rekap" title="Rekap Bulanan Karyawan" />
      <PageBody>
        <Suspense fallback={<div className="h-[480px] rounded-xl border border-line bg-shell/60 animate-pulse" />}>
          <Content searchParams={searchParams} />
        </Suspense>
      </PageBody>
    </>
  );
}

const CELL: Record<AttendanceStatus, { label: string; cls: string }> = {
  hadir: { label: "H", cls: "bg-emerald-500/15 text-emerald-400" },
  sakit: { label: "S", cls: "bg-amber-500/20 text-amber-400" },
  tidak_hadir: { label: "TH", cls: "bg-rose-500/20 text-rose-400" },
  libur: { label: "L", cls: "bg-sky-500/15 text-sky-300" },
};

const LEGEND = [
  { dot: "bg-emerald-500", text: "text-emerald-400", label: "Hadir (H)" },
  { dot: "bg-amber-500", text: "text-amber-400", label: "Sakit (S)" },
  { dot: "bg-rose-500", text: "text-rose-400", label: "Tidak Hadir (TH)" },
  { dot: "bg-sky-500", text: "text-sky-300", label: "Libur (L)" },
  { dot: "bg-slate-600", text: "text-slate-400", label: "Belum diisi (-)" },
];

const AVATAR = [
  "bg-indigo-600/40 border-indigo-400/50 text-indigo-200",
  "bg-cyan-600/30 border-cyan-400/50 text-cyan-200",
  "bg-purple-600/40 border-purple-400/50 text-purple-200",
  "bg-teal-600/30 border-teal-400/50 text-teal-200",
];

async function Content({ searchParams }: { searchParams: PageProps<"/absensi/rekap">["searchParams"] }) {
  const { activeBranch } = await getShellData();
  const today = todayWIB();
  const params = await searchParams;
  const month = parseMonthParam(typeof params.bulan === "string" ? params.bulan : undefined, monthOf(today));
  const roleId = typeof params.role === "string" ? params.role : "";

  if (!activeBranch) {
    return <p className="text-sm text-gray-300">Belum ada cabang.</p>;
  }

  const [{ days, rows, totals }, roles] = await Promise.all([
    getMonthlyRekap(activeBranch.id, month, roleId || undefined),
    getJobRoles(),
  ]);

  const qs = (m: string) => `/absensi/rekap?bulan=${m}${roleId ? `&role=${roleId}` : ""}`;
  const isCurrentMonth = month === monthOf(today);
  const exportHref = `/absensi/rekap/export?bulan=${month}${roleId ? `&role=${roleId}` : ""}`;

  return (
    <section aria-label="Rekap bulanan" className="flex flex-col gap-4">
      {/* Kontrol */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center flex-wrap gap-3">
          <div className="flex items-center bg-panel-inset border border-slate-700/60 rounded-xl px-2.5 py-1 text-xs">
            <Link href={qs(shiftMonth(month, -1))} aria-label="Bulan sebelumnya" className="p-1 hover:text-cyan-400 text-slate-400 transition-colors">
              <Icon name="chevron_left" className="text-[16px]" />
            </Link>
            <div className="flex items-center gap-1.5 px-2 font-medium text-slate-200 min-w-[120px] justify-center">
              <Icon name="calendar_month" className="text-[15px] text-cyan-400" />
              {formatMonthLong(month)}
            </div>
            {isCurrentMonth ? (
              <span className="p-1 text-slate-700" aria-hidden="true">
                <Icon name="chevron_right" className="text-[16px]" />
              </span>
            ) : (
              <Link href={qs(shiftMonth(month, 1))} aria-label="Bulan berikutnya" className="p-1 hover:text-cyan-400 text-slate-400 transition-colors">
                <Icon name="chevron_right" className="text-[16px]" />
              </Link>
            )}
          </div>

          <div className="flex flex-wrap items-center text-xs divide-x divide-slate-800 bg-panel-inset border border-slate-800/90 rounded-xl px-3 py-1 text-slate-300 tabular-nums">
            <div className="pr-3 font-semibold text-slate-200">
              Total: <span className="text-cyan-400">{rows.length}</span>
            </div>
            <div className="px-3">
              Rata Kehadiran:{" "}
              <span className="text-emerald-400 font-bold">{totals.percent === null ? "–" : `${totals.percent}%`}</span>
            </div>
            <div className="px-3">
              Sakit: <span className="text-amber-400 font-semibold">{totals.sakit}</span>
            </div>
            <div className="pl-3">
              Tidak Hadir: <span className="text-rose-400 font-semibold">{totals.tidakHadir}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-3">
          <div className="hidden xl:flex items-center gap-2 text-[10px] text-slate-400 bg-panel-inset px-2.5 py-1 rounded-lg border border-slate-800">
            {LEGEND.map((l, i) => (
              <span key={l.label} className="flex items-center gap-1">
                {i > 0 && <span className="mr-1">•</span>}
                <span className={`w-2 h-2 rounded-full ${l.dot}`} />
                <span className={`${l.text} font-medium`}>{l.label}</span>
              </span>
            ))}
          </div>
          <RoleFilter roles={roles.map((r) => ({ id: r.id, name: r.name }))} value={roleId} month={month} />
          <a
            href={exportHref}
            className="px-2.5 py-1 bg-panel-inset hover:bg-slate-700/60 border border-slate-700/70 rounded-xl text-xs font-medium text-slate-200 flex items-center gap-1 transition-colors"
          >
            <Icon name="download" className="text-[15px] text-cyan-400" />
            Export CSV
          </a>
        </div>
      </div>

      {/* Matriks */}
      <div className="overflow-auto rounded-xl border border-slate-800/80 bg-shell max-h-[70vh]">
        <table className="w-full text-left border-collapse text-xs select-none">
          <thead className="bg-panel-inset text-slate-300 sticky top-0 z-30 shadow-md">
            <tr className="border-b border-slate-800">
              <th scope="col" className="sticky left-0 z-20 bg-panel-inset py-2.5 px-2 text-center w-11 min-w-11 border-r border-slate-800 text-[11px] font-semibold text-slate-400">
                No
              </th>
              <th scope="col" className="sticky left-11 z-20 bg-panel-inset py-2.5 px-3 w-20 min-w-20 border-r border-slate-800 text-[11px] font-semibold text-slate-400">
                NIK
              </th>
              <th scope="col" className="sticky left-31 z-20 bg-panel-inset py-2.5 px-3 min-w-[210px] border-r border-slate-800 text-[11px] font-semibold text-slate-300 shadow-[4px_0_10px_-2px_rgba(0,0,0,0.5)]">
                Nama Karyawan &amp; Role
              </th>
              {days.map((d) => {
                const isToday = d.date === today;
                const future = d.date > today;
                return (
                  <th
                    key={d.date}
                    scope="col"
                    className={`p-1 text-center font-normal min-w-[30px] border-r ${
                      isToday
                        ? "border-cyan-500/50 bg-cyan-950/40 ring-1 ring-cyan-500/40"
                        : d.dow === 0
                          ? "border-slate-800/60 bg-rose-950/20"
                          : d.dow === 6
                            ? "border-slate-800/60 bg-slate-800/30"
                            : "border-slate-800/60"
                    }`}
                  >
                    <span
                      className={`text-[9px] block ${
                        isToday ? "text-cyan-300 font-bold" : d.dow === 0 ? "text-rose-400/80" : d.dow === 6 ? "text-cyan-400/80" : "text-slate-500"
                      }`}
                    >
                      {d.weekday}
                      {isToday ? "*" : ""}
                    </span>
                    <span className={`font-bold ${isToday ? "text-cyan-200" : future ? "text-slate-500" : "text-slate-200"}`}>{d.day}</span>
                  </th>
                );
              })}
              <th scope="col" title="Total Hadir" className="p-1 text-center font-semibold text-emerald-400 min-w-[34px] border-r border-slate-800 bg-panel-inset">H</th>
              <th scope="col" title="Total Sakit" className="p-1 text-center font-semibold text-amber-400 min-w-[32px] border-r border-slate-800 bg-panel-inset">S</th>
              <th scope="col" title="Total Tidak Hadir" className="p-1 text-center font-semibold text-rose-400 min-w-[32px] border-r border-slate-800 bg-panel-inset">TH</th>
              <th scope="col" title="Persentase Kehadiran" className="p-1.5 text-center font-semibold text-cyan-300 min-w-[54px] bg-panel-inset">%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70 font-mono text-[11px]">
            {rows.map((r, i) => (
              <tr key={r.employeeId} className="hover:bg-slate-800/40 transition-colors group">
                <td className="sticky left-0 z-10 bg-panel-inset group-hover:bg-panel-inset py-2 px-2 text-center text-slate-400 border-r border-slate-800">{i + 1}</td>
                <td className="sticky left-11 z-10 bg-panel-inset group-hover:bg-panel-inset py-2 px-3 text-slate-300 border-r border-slate-800 text-[10px]">{r.nik}</td>
                <td className="sticky left-31 z-10 bg-panel-inset group-hover:bg-panel-inset py-2 px-3 border-r border-slate-800 shadow-[4px_0_10px_-2px_rgba(0,0,0,0.5)] font-sans">
                  <Link href={`/absensi/karyawan/${r.employeeId}`} className="flex items-center gap-2.5 min-w-0 hover:opacity-90">
                    <span className={`w-6 h-6 rounded-full border flex items-center justify-center text-[10px] font-bold shrink-0 ${AVATAR[i % AVATAR.length]}`}>
                      {initials(r.name)}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-bold text-slate-100 truncate">{r.name}</span>
                      <span className="block text-[10px] text-cyan-400/90 font-medium truncate">
                        {r.roleName}
                        {r.origin && (
                          <span className="text-purple-300">
                            {" "}
                            · {r.origin.kind === "backup" ? "Backup" : "Absen di sini"} dari {r.origin.code}
                          </span>
                        )}
                      </span>
                    </span>
                  </Link>
                </td>
                {days.map((d) => {
                  const status = r.cells[d.date];
                  const isToday = d.date === today;
                  const bg = isToday ? "bg-cyan-950/20" : d.dow === 0 ? "bg-rose-950/15" : d.dow === 6 ? "bg-slate-800/30" : "";
                  return (
                    <td key={d.date} className={`p-0.5 text-center border-r border-slate-800/50 ${bg}`}>
                      {status ? (
                        <span
                          title={`${d.day} ${formatMonthLong(month)}: ${CELL[status].label}`}
                          className={`min-w-5 h-5 px-0.5 rounded-md inline-flex items-center justify-center font-bold text-[10px] ${CELL[status].cls}`}
                        >
                          {CELL[status].label}
                        </span>
                      ) : r.elsewhere[d.date] ? (
                        <span
                          title={`${d.day} ${formatMonthLong(month)}: tercatat di cabang ${r.elsewhere[d.date]} (tidak dihitung di sini)`}
                          className="min-w-5 h-5 px-0.5 rounded-md inline-flex items-center justify-center text-[10px] text-purple-300 bg-purple-500/10"
                        >
                          ↗
                        </span>
                      ) : (
                        <span className="text-slate-600 text-[10px]">{d.date > today ? "•" : "-"}</span>
                      )}
                    </td>
                  );
                })}
                <td className="p-1 text-center border-r border-slate-800 bg-panel-inset text-emerald-400 font-bold">{r.summary.hadir}</td>
                <td className="p-1 text-center border-r border-slate-800 bg-panel-inset text-amber-400">{r.summary.sakit}</td>
                <td className="p-1 text-center border-r border-slate-800 bg-panel-inset text-rose-400">{r.summary.tidakHadir}</td>
                <td className="p-1 text-center bg-panel-inset text-slate-100 font-bold">
                  {r.summary.percent === null ? "–" : `${Math.round(r.summary.percent)}%`}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={days.length + 7} className="py-10 text-center text-slate-400 font-sans">
                  Tidak ada karyawan di cabang ini pada bulan tersebut.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500">
        % kehadiran = hari Hadir ÷ hari yang sudah diisi. Sabtu/Minggu hanya diberi warna, tetap dihitung bila diisi.
      </p>
    </section>
  );
}
