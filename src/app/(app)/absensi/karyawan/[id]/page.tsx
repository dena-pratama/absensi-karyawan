import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Icon } from "@/components/icon";
import { PageBody } from "@/components/shell/page-layout";
import { getAttendance, summarize, type AttendanceEntry } from "@/lib/data/attendance";
import { getEmployeeDetail } from "@/lib/data/employee";
import { daysOfMonth, formatDateLong, formatMonthLong, formatMonthShort, initials, monthOf, monthRange, shiftMonth, todayWIB } from "@/lib/format";
import { ATTENDANCE_LABEL, BRANCH_TYPE_LABEL, type AttendanceStatus } from "@/lib/labels";
import { AbsensiHeader } from "../../_components/absensi-header";
import { KasbonHistory } from "./kasbon-history";
import { TrendChart, type TrendPoint } from "./trend-chart";

export const metadata: Metadata = { title: "Detail Karyawan" };

const TREND_MONTHS = 6;

export default function EmployeeDetailPage({ params }: PageProps<"/absensi/karyawan/[id]">) {
  return (
    <>
      <AbsensiHeader tab="karyawan" title="Detail Karyawan" />
      <PageBody>
        <Suspense fallback={<div className="h-[520px] rounded-2xl bg-panel border border-line animate-pulse" />}>
          <Content params={params} />
        </Suspense>
      </PageBody>
    </>
  );
}

const STATUS_STYLE: Record<AttendanceStatus, { fill: string; chip: string; dot: string; short: string }> = {
  hadir: { fill: "#10b981", chip: "bg-emerald-500/15 text-emerald-300", dot: "bg-emerald-400", short: "H" },
  sakit: { fill: "#f59e0b", chip: "bg-amber-500/20 text-amber-300", dot: "bg-amber-400", short: "S" },
  tidak_hadir: { fill: "#f43f5e", chip: "bg-rose-500/20 text-rose-300", dot: "bg-rose-400", short: "TH" },
};

const CONTRACT_LABEL = { tetap: "Tetap (PKWTT)", pkwt: "PKWT (Kontrak)", mitra: "Kemitraan / Ritase" } as const;

async function Content({ params }: { params: PageProps<"/absensi/karyawan/[id]">["params"] }) {
  const { id } = await params;
  const employee = await getEmployeeDetail(id);
  if (!employee) notFound();

  const today = todayWIB();
  const month = monthOf(today);
  const firstMonth = shiftMonth(month, -(TREND_MONTHS - 1));
  const history = await getAttendance([employee.id], monthRange(firstMonth).start, today);

  const inMonth = (m: string) => history.filter((a) => a.date.startsWith(m));
  const current = summarize(inMonth(month));
  const previous = summarize(inMonth(shiftMonth(month, -1)));
  const all = summarize(history);
  const delta = current.percent !== null && previous.percent !== null ? current.percent - previous.percent : null;

  const trend: TrendPoint[] = Array.from({ length: TREND_MONTHS }, (_, i) => {
    const m = shiftMonth(firstMonth, i);
    const s = summarize(inMonth(m));
    return { month: formatMonthShort(m), label: formatMonthLong(m), percent: s.percent, hadir: s.hadir, total: s.total };
  });

  const recent = [...history].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);

  return (
    <>
      <Link href="/absensi/karyawan" className="self-start text-xs text-gray-400 hover:text-cyan-400 flex items-center gap-1 transition">
        <Icon name="arrow_back" className="text-[16px]" />
        Kembali ke Daftar Karyawan
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Profil + riwayat kasbon tepat di bawahnya */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <section aria-label="Profil karyawan" className="bg-panel border border-line rounded-2xl p-5 flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <span className="w-14 h-14 rounded-full bg-gradient-to-tr from-cyan-400 to-indigo-500 p-[2px] flex-shrink-0">
                <span className="w-full h-full rounded-full bg-gray-900 flex items-center justify-center font-bold text-base text-ink">
                  {initials(employee.name)}
                </span>
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-ink truncate">{employee.name}</h2>
                <p className="text-xs text-cyan-400 truncate">{employee.assignment?.role ?? "Belum ditempatkan"}</p>
                <span
                  className={`inline-flex mt-1 items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] ${
                    employee.isActive ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-gray-500/10 text-gray-400 border-gray-500/30"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${employee.isActive ? "bg-emerald-400" : "bg-gray-500"}`} />
                  {employee.isActive ? "Aktif" : "Nonaktif"}
                </span>
              </div>
            </div>
            <dl className="grid grid-cols-1 gap-3 text-xs">
              <Field label="NIK / ID" value={<span className="font-mono">{employee.nik}</span>} />
              <Field
                label="Cabang"
                value={
                  employee.assignment
                    ? `${employee.assignment.branch.code} - ${employee.assignment.branch.name} (${BRANCH_TYPE_LABEL[employee.assignment.branch.type]})`
                    : "-"
                }
              />
              <Field label="No. WhatsApp" value={<span className="font-mono">{employee.phone ?? "-"}</span>} />
              <Field label="Status Kontrak" value={CONTRACT_LABEL[employee.contract]} />
              <Field label="Tanggal Bergabung" value={employee.joinDate ? formatDateLong(employee.joinDate) : "-"} />
              <Field label="Ditempatkan Sejak" value={employee.assignment ? formatDateLong(employee.assignment.validFrom) : "-"} />
            </dl>
          </section>
          <Suspense fallback={<div className="h-48 rounded-2xl bg-panel border border-line animate-pulse" />}>
            <KasbonHistory employeeId={employee.id} />
          </Suspense>
        </div>

        {/* Statistik & chart */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          <section aria-label="Ringkasan kehadiran" className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Stat
              label={`Kehadiran ${formatMonthShort(month)}`}
              value={current.percent === null ? "–" : `${current.percent}%`}
              sub={
                delta === null
                  ? `${current.hadir}/${current.total} hari`
                  : `${delta >= 0 ? "▲" : "▼"} ${Math.abs(Math.round(delta * 10) / 10)} poin vs bulan lalu`
              }
              subTone={delta === null ? "text-gray-400" : delta >= 0 ? "text-emerald-400" : "text-rose-400"}
            />
            <Stat label="Hadir" value={current.hadir} sub="hari bulan ini" dot="bg-emerald-400" />
            <Stat label="Sakit" value={current.sakit} sub="hari bulan ini" dot="bg-amber-400" />
            <Stat label="Tidak Hadir" value={current.tidakHadir} sub="hari bulan ini" dot="bg-rose-400" />
          </section>

          <section aria-labelledby="trend-title" className="bg-panel border border-line rounded-2xl p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <h3 id="trend-title" className="text-sm font-bold text-ink">
                Persentase Kehadiran {TREND_MONTHS} Bulan Terakhir
              </h3>
              <span className="text-[11px] text-gray-400 tabular-nums">Rata-rata: {all.percent === null ? "–" : `${all.percent}%`}</span>
            </div>
            <TrendChart points={trend} />
          </section>

          <section aria-labelledby="komposisi-title" className="bg-panel border border-line rounded-2xl p-5 flex flex-col gap-3">
            <h3 id="komposisi-title" className="text-sm font-bold text-ink">
              Komposisi {formatMonthLong(month)}
            </h3>
            <Composition summary={current} />
            <MonthCalendar month={month} today={today} entries={inMonth(month)} />
          </section>
        </div>
      </div>

      <section aria-labelledby="riwayat-title" className="bg-panel border border-line rounded-2xl p-5 flex flex-col gap-3">
        <h3 id="riwayat-title" className="text-sm font-bold text-ink">
          Riwayat Absensi Terbaru
        </h3>
        {recent.length ? (
          <ul className="divide-y divide-line/60">
            {recent.map((a) => (
              <li key={a.date} className="flex items-center justify-between gap-3 py-2.5 text-xs">
                <span className="text-gray-300">{formatDateLong(a.date)}</span>
                <span className="flex items-center gap-3 min-w-0">
                  {a.note && <span className="text-gray-400 italic truncate">{a.note}</span>}
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium flex-shrink-0 ${STATUS_STYLE[a.status].chip}`}>
                    {ATTENDANCE_LABEL[a.status]}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-gray-400 py-4 text-center">Belum ada riwayat absensi.</p>
        )}
      </section>
    </>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[10px] uppercase tracking-wider text-gray-500">{label}</dt>
      <dd className="text-gray-200">{value}</dd>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  subTone = "text-gray-400",
  dot,
}: {
  label: string;
  value: string | number;
  sub: string;
  subTone?: string;
  dot?: string;
}) {
  return (
    <div className="bg-panel border border-line rounded-2xl p-4 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
        {dot && <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />}
        {label}
      </div>
      <div className="text-2xl font-semibold text-ink tabular-nums">{value}</div>
      <div className={`text-[10px] ${subTone}`}>{sub}</div>
    </div>
  );
}

/** Bar bertumpuk hadir/sakit/tidak hadir (celah 2px antar segmen) + legend berlabel. */
function Composition({ summary }: { summary: ReturnType<typeof summarize> }) {
  const parts: { key: AttendanceStatus; value: number }[] = [
    { key: "hadir", value: summary.hadir },
    { key: "sakit", value: summary.sakit },
    { key: "tidak_hadir", value: summary.tidakHadir },
  ];
  if (summary.total === 0) return <p className="text-xs text-gray-400">Belum ada data bulan ini.</p>;

  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex h-3 w-full gap-[2px] rounded-full overflow-hidden"
        role="img"
        aria-label={parts.map((p) => `${ATTENDANCE_LABEL[p.key]} ${p.value} hari`).join(", ")}
      >
        {parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <div
              key={p.key}
              title={`${ATTENDANCE_LABEL[p.key]}: ${p.value} hari`}
              style={{ flexGrow: p.value, backgroundColor: STATUS_STYLE[p.key].fill }}
            />
          ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-300 tabular-nums">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${STATUS_STYLE[p.key].dot}`} />
            {ATTENDANCE_LABEL[p.key]} {p.value} ({Math.round((p.value / summary.total) * 100)}%)
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Kalender bulan berjalan: tiap hari berisi kode status (bukan warna saja). */
function MonthCalendar({ month, today, entries }: { month: string; today: string; entries: AttendanceEntry[] }) {
  const byDate = new Map(entries.map((e) => [e.date, e.status]));
  const days = daysOfMonth(month);
  const leading = (days[0].dow + 6) % 7; // minggu dimulai Senin

  return (
    <div className="mt-2">
      <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] text-gray-500 mb-1.5">
        {["Sn", "Sl", "Rb", "Km", "Jm", "Sb", "Mg"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: leading }, (_, i) => (
          <span key={`pad-${i}`} />
        ))}
        {days.map((d) => {
          const status = byDate.get(d.date);
          const future = d.date > today;
          return (
            <div
              key={d.date}
              title={`${formatDateLong(d.date)}: ${status ? ATTENDANCE_LABEL[status] : future ? "-" : "Belum diisi"}`}
              className={`h-10 rounded-lg flex flex-col items-center justify-center text-[10px] border ${
                d.date === today ? "border-cyan-500/60" : "border-transparent"
              } ${status ? STATUS_STYLE[status].chip : "bg-panel-raised text-gray-500"} ${future ? "opacity-40" : ""}`}
            >
              <span className="leading-none">{d.day}</span>
              <span className="font-bold leading-none mt-0.5">{status ? STATUS_STYLE[status].short : "·"}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
