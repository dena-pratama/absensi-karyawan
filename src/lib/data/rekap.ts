import "server-only";
import { daysOfMonth, monthRange } from "@/lib/format";
import type { AttendanceStatus } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import { getAttendance, getRoster, getRosterForEmployees, summarize, type RosterEntry } from "./attendance";
import { getBackups, getBranchCodes } from "./backup";

export type RekapRow = RosterEntry & {
  cells: Record<string, AttendanceStatus>; // date → status (dicatat di cabang ini)
  /** date → kode cabang lain tempat absen dicatat (backup / sebelum mutasi). Tidak dihitung di rekap ini. */
  elsewhere: Record<string, string>;
  /** Karyawan cabang lain yang di-backup / absen (mis. SPV) di sini bulan ini, dengan kode cabang asal. */
  origin: { kind: "backup" | "visit"; code: string } | null;
  summary: ReturnType<typeof summarize>;
};

/**
 * Matriks rekap bulanan untuk satu cabang (opsional difilter per jabatan).
 * Absensi karyawan backup dihitung di cabang tujuan, jadi hanya absen yang
 * dicatat di cabang ini yang masuk hitungan.
 */
export async function getMonthlyRekap(branchId: string, month: string, roleId?: string) {
  const { start, end } = monthRange(month);
  const supabase = await createClient();
  const [home, { rows: backups }, { data: visits }, codeOf] = await Promise.all([
    getRoster(branchId, start, end),
    getBackups({ from: start, to: end }),
    // Karyawan cabang lain yang absen di cabang ini (mis. SPV yang memilih outlet ini)
    supabase.from("attendance_daily").select("employee_id").eq("branch_id", branchId).gte("attendance_date", start).lte("attendance_date", end),
    getBranchCodes(),
  ]);

  const incoming = backups.filter((b) => b.toBranchId === branchId);
  const homeIds = new Set(home.map((r) => r.employeeId));
  const visitorIds = ((visits ?? []) as { employee_id: string }[]).map((v) => v.employee_id);
  const visiting = (
    await getRosterForEmployees([...new Set([...incoming.map((b) => b.employeeId), ...visitorIds])], start, end)
  ).filter((r) => !homeIds.has(r.employeeId));
  const fromCode = new Map(incoming.map((b) => [b.employeeId, b.fromCode]));

  const roster = [...home, ...visiting]
    .filter((r) => !roleId || r.roleId === roleId)
    .sort((a, b) => a.nik.localeCompare(b.nik));

  const attendance = await getAttendance(
    roster.map((r) => r.employeeId),
    start,
    end,
  );

  const byEmployee = new Map<string, typeof attendance>();
  for (const a of attendance) {
    const list = byEmployee.get(a.employeeId) ?? [];
    list.push(a);
    byEmployee.set(a.employeeId, list);
  }

  const rows: RekapRow[] = roster.map((r) => {
    const list = byEmployee.get(r.employeeId) ?? [];
    const here = list.filter((a) => a.branchId === branchId);
    const there = list.filter((a) => a.branchId !== branchId);
    return {
      ...r,
      cells: Object.fromEntries(here.map((a) => [a.date, a.status])),
      elsewhere: Object.fromEntries(there.map((a) => [a.date, codeOf.get(a.branchId) ?? "-"])),
      origin: homeIds.has(r.employeeId)
        ? null
        : fromCode.has(r.employeeId)
          ? { kind: "backup", code: fromCode.get(r.employeeId) ?? "-" }
          : { kind: "visit", code: codeOf.get(r.branchId) ?? "-" },
      summary: summarize(here),
    };
  });

  return { days: daysOfMonth(month), rows, totals: summarize(attendance.filter((a) => a.branchId === branchId)) };
}
