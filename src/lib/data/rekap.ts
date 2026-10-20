import "server-only";
import { daysOfMonth, monthRange } from "@/lib/format";
import type { AttendanceStatus } from "@/lib/labels";
import { getAttendance, getRoster, summarize, type RosterEntry } from "./attendance";

export type RekapRow = RosterEntry & {
  cells: Record<string, AttendanceStatus>; // date → status
  summary: ReturnType<typeof summarize>;
};

/** Matriks rekap bulanan untuk satu cabang (opsional difilter per jabatan). */
export async function getMonthlyRekap(branchId: string, month: string, roleId?: string) {
  const { start, end } = monthRange(month);
  const roster = (await getRoster(branchId, start, end)).filter((r) => !roleId || r.roleId === roleId);
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
    return {
      ...r,
      cells: Object.fromEntries(list.map((a) => [a.date, a.status])),
      summary: summarize(list),
    };
  });

  return { days: daysOfMonth(month), rows, totals: summarize(attendance) };
}
