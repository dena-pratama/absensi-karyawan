import type { Metadata } from "next";
import { Suspense } from "react";
import { PageBody } from "@/components/shell/page-layout";
import { getAttendance, getJobRoles, getRoster, summarize } from "@/lib/data/attendance";
import { getShellData } from "@/lib/data/shell";
import { formatMonthLong, monthOf, monthRange, todayWIB } from "@/lib/format";
import { AbsensiHeader } from "../_components/absensi-header";
import { EmployeeTable, type EmployeeListRow } from "./employee-table";

export const metadata: Metadata = { title: "Daftar Karyawan" };

export default function DaftarKaryawanPage({ searchParams }: PageProps<"/absensi/karyawan">) {
  return (
    <>
      <AbsensiHeader tab="karyawan" title="Daftar Karyawan Hub" />
      <PageBody>
        <Suspense fallback={<Skeleton />}>
          <Content searchParams={searchParams} />
        </Suspense>
      </PageBody>
    </>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/absensi/karyawan">["searchParams"] }) {
  const { activeBranch } = await getShellData();
  const q = (await searchParams).q;
  const today = todayWIB();
  const month = monthOf(today);
  const { start } = monthRange(month);

  if (!activeBranch) return <p className="text-sm text-gray-300">Belum ada cabang.</p>;

  const [roster, roles] = await Promise.all([getRoster(activeBranch.id, today), getJobRoles()]);
  const attendance = await getAttendance(
    roster.map((r) => r.employeeId),
    start,
    today,
  );

  const rows: EmployeeListRow[] = roster.map((r) => {
    const mine = attendance.filter((a) => a.employeeId === r.employeeId);
    return {
      ...r,
      month: summarize(mine),
      todayStatus: mine.find((a) => a.date === today)?.status ?? null,
    };
  });

  const todayList = attendance.filter((a) => a.date === today);
  const todaySum = summarize(todayList);
  const monthSum = summarize(attendance);
  const total = roster.length;
  const contracts = {
    tetap: roster.filter((r) => r.contract === "tetap").length,
    pkwt: roster.filter((r) => r.contract === "pkwt").length,
    mitra: roster.filter((r) => r.contract === "mitra").length,
  };
  const hadirPct = total ? Math.round((todaySum.hadir / total) * 1000) / 10 : null;

  return (
    <>
      {/* Summary cards */}
      <section aria-label="Ringkasan karyawan" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          label="Total Staf Terdaftar"
          value={total}
          sub={`Tetap ${contracts.tetap} • PKWT ${contracts.pkwt} • Mitra ${contracts.mitra}`}
          accent="bg-cyan-400"
        />
        <SummaryCard
          label="Hadir Hari Ini"
          value={todaySum.hadir}
          sub={hadirPct === null ? "Belum ada staf" : `${hadirPct}% dari ${total} staf`}
          accent="bg-emerald-400"
        />
        <SummaryCard
          label="Sakit / Tidak Hadir"
          value={`${todaySum.sakit} / ${todaySum.tidakHadir}`}
          sub={`${total - todayList.length} staf belum diabsen hari ini`}
          accent="bg-amber-400"
        />
        <SummaryCard
          label="Rata-rata Kehadiran"
          value={monthSum.percent === null ? "–" : `${monthSum.percent}%`}
          sub={`${formatMonthLong(month)} • ${monthSum.total} data`}
          accent="bg-sky-400"
        />
      </section>

      <EmployeeTable
        key={typeof q === "string" ? q : ""}
        rows={rows}
        roles={roles.map((r) => ({ id: r.id, name: r.name }))}
        initialQuery={typeof q === "string" ? q : ""}
        monthLabel={formatMonthLong(month)}
      />
    </>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub: string;
  accent: string;
}) {
  return (
    <div className="bg-panel border border-line rounded-2xl p-4 flex flex-col gap-1 hover:border-line-strong transition">
      <div className="flex items-center gap-2 text-[11px] font-medium text-gray-400">
        <span className={`w-1.5 h-1.5 rounded-full ${accent}`} />
        {label}
      </div>
      <div className="text-2xl font-semibold text-ink tabular-nums">{value}</div>
      <div className="text-[10px] text-gray-400 truncate">{sub}</div>
    </div>
  );
}

function Skeleton() {
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-2xl bg-panel border border-line animate-pulse" />
        ))}
      </div>
      <div className="h-96 rounded-xl border border-line bg-shell/60 animate-pulse" />
    </>
  );
}
