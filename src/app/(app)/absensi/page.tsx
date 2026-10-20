import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageBody } from "@/components/shell/page-layout";
import { getAttendance, getJobRoles, getRoster } from "@/lib/data/attendance";
import { getShellData } from "@/lib/data/shell";
import { formatTimeWIB, parseDateParam, todayWIB } from "@/lib/format";
import { AbsensiHeader } from "./_components/absensi-header";
import { AttendanceForm, type FormRow } from "./_components/attendance-form";

export const metadata: Metadata = { title: "Absensi Harian" };

export default function AbsensiHarianPage({ searchParams }: PageProps<"/absensi">) {
  return (
    <>
      <AbsensiHeader tab="harian" title="Absensi Harian Karyawan" />
      <PageBody>
        <Suspense fallback={<TableSkeleton />}>
          <Content searchParams={searchParams} />
        </Suspense>
      </PageBody>
    </>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/absensi">["searchParams"] }) {
  const { activeBranch } = await getShellData();
  const today = todayWIB();
  const raw = (await searchParams).tanggal;
  const date = parseDateParam(typeof raw === "string" ? raw : undefined, today);

  if (!activeBranch) {
    return (
      <div className="rounded-2xl border border-dashed border-line-strong bg-panel p-10 text-center text-sm text-gray-300">
        Belum ada cabang.{" "}
        <Link href="/pengaturan" className="text-cyan-400 hover:text-cyan-300 font-semibold">
          Tambah cabang di Pengaturan →
        </Link>
      </div>
    );
  }

  const [roster, roles] = await Promise.all([getRoster(activeBranch.id, date), getJobRoles()]);
  const attendance = await getAttendance(
    roster.map((r) => r.employeeId),
    date,
  );
  const byEmployee = new Map(attendance.map((a) => [a.employeeId, a]));

  const rows: FormRow[] = roster.map((r) => {
    const a = byEmployee.get(r.employeeId);
    return {
      employeeId: r.employeeId,
      nik: r.nik,
      name: r.name,
      roleId: r.roleId,
      roleName: r.roleName,
      status: a?.status ?? null,
      note: a?.note ?? "",
    };
  });
  const last = attendance.reduce<string | null>((m, a) => (!m || a.updatedAt > m ? a.updatedAt : m), null);

  return (
    <AttendanceForm
      key={`${activeBranch.id}-${date}`}
      branchId={activeBranch.id}
      branchCode={activeBranch.code}
      date={date}
      today={today}
      rows={rows}
      roles={roles.map((r) => ({ id: r.id, name: r.name }))}
      lastUpdate={last ? formatTimeWIB(last) : null}
    />
  );
}

function TableSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-6 w-80 rounded bg-panel animate-pulse" />
      <div className="h-8 w-full rounded bg-panel animate-pulse" />
      <div className="h-96 rounded-xl border border-line bg-shell/60 animate-pulse" />
    </div>
  );
}
