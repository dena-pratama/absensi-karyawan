import "server-only";
import { daysOfMonth, monthRange } from "@/lib/format";
import type { AttendanceStatus } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import { getAttendance, getRoster, getRosterForEmployees, summarize, type RosterEntry } from "./attendance";
import { getBackups } from "./backup";

export type RekapRow = RosterEntry & {
  cells: Record<string, AttendanceStatus>; // date → status (dicatat di cabang ini)
  /** date → kode cabang lain tempat absen dicatat (backup / sebelum mutasi). Tidak dihitung di rekap ini. */
  elsewhere: Record<string, string>;
  /** Karyawan cabang lain yang di-backup ke sini bulan ini (kode cabang asal). */
  backupFrom: string | null;
  summary: ReturnType<typeof summarize>;
};

/**
 * Matriks rekap bulanan untuk satu cabang (opsional difilter per jabatan).
 * Absensi karyawan backup dihitung di cabang tujuan, jadi hanya absen yang
 * dicatat di cabang ini yang masuk hitungan.
 */
export async function getMonthlyRekap(branchId: string, month: string, roleId?: string) {
  const { start, end } = monthRange(month);
  const [home, { rows: backups }] = await Promise.all([getRoster(branchId, start, end), getBackups({ from: start, to: end })]);

  const incoming = backups.filter((b) => b.toBranchId === branchId);
  const homeIds = new Set(home.map((r) => r.employeeId));
  const visiting = (await getRosterForEmployees([...new Set(incoming.map((b) => b.employeeId))], start, end)).filter(
    (r) => !homeIds.has(r.employeeId),
  );
  const fromCode = new Map(incoming.map((b) => [b.employeeId, b.fromCode]));

  const roster = [...home, ...visiting]
    .filter((r) => !roleId || r.roleId === roleId)
    .sort((a, b) => a.nik.localeCompare(b.nik));

  const supabase = await createClient();
  const [attendance, { data: branchRows }] = await Promise.all([
    getAttendance(
      roster.map((r) => r.employeeId),
      start,
      end,
    ),
    supabase.from("branch").select("id, code"),
  ]);
  const codeOf = new Map((branchRows ?? []).map((b) => [b.id as string, b.code as string]));

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
      backupFrom: homeIds.has(r.employeeId) ? null : (fromCode.get(r.employeeId) ?? null),
      summary: summarize(here),
    };
  });

  return { days: daysOfMonth(month), rows, totals: summarize(attendance.filter((a) => a.branchId === branchId)) };
}
