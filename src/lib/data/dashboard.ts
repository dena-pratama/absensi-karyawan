import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AttendanceStatus } from "@/lib/labels";
import { getBackups } from "./backup";
import type { BranchSummary } from "./shell";

export type StaffToday = {
  employeeId: string;
  nik: string;
  name: string;
  role: string;
  status: AttendanceStatus | null; // null = belum diabsen hari ini
  updatedAt: string | null;
};

export type BranchStats = BranchSummary & {
  total: number;
  hadir: number;
  sakit: number;
  tidakHadir: number;
  belum: number;
  percent: number | null; // hadir / total staf aktif
  staff: StaffToday[];
  lastUpdate: string | null;
};

type AssignmentRow = {
  employee_id: string;
  branch_id: string;
  employee: { nik: string; full_name: string } | null;
  job_role: { name: string } | null;
};

type AttendanceRow = {
  employee_id: string;
  branch_id: string;
  status: AttendanceStatus;
  updated_at: string;
};

/**
 * Rekap kehadiran hari ini per cabang.
 * Roster = penempatan yang berlaku pada tanggal itu dari karyawan yang masih aktif;
 * karyawan dihitung di cabang tempat absen hari itu (backup / SPV di outlet lain).
 */
export async function getDashboardStats(branches: BranchSummary[], date: string): Promise<BranchStats[]> {
  const supabase = await createClient();
  const [assignRes, attRes, { rows: backups }] = await Promise.all([
    supabase
      .from("employee_assignment")
      .select("employee_id, branch_id, employee:employee_id!inner(nik, full_name), job_role:job_role_id(name)")
      .lte("valid_from", date)
      .or(`valid_to.is.null,valid_to.gte.${date}`)
      .eq("employee.is_active", true),
    supabase.from("attendance_daily").select("employee_id, branch_id, status, updated_at").eq("attendance_date", date),
    getBackups({ from: date, to: date }),
  ]);
  if (assignRes.error) throw new Error(`Gagal memuat penempatan karyawan: ${assignRes.error.message}`);
  if (attRes.error) throw new Error(`Gagal memuat absensi: ${attRes.error.message}`);

  const attendance = new Map(
    ((attRes.data ?? []) as AttendanceRow[]).map((a) => [a.employee_id, a]),
  );
  const backupTo = new Map(backups.map((b) => [b.employeeId, b.toBranchId]));
  const staffByBranch = new Map<string, StaffToday[]>();
  for (const row of (assignRes.data ?? []) as unknown as AssignmentRow[]) {
    if (!row.employee) continue;
    const att = attendance.get(row.employee_id);
    // Cabang tempat absen hari itu (mis. SPV di outlet lain) > cabang backup > penempatan
    const branchId = att?.branch_id ?? backupTo.get(row.employee_id) ?? row.branch_id;
    const list = staffByBranch.get(branchId) ?? [];
    list.push({
      employeeId: row.employee_id,
      nik: row.employee.nik,
      name: row.employee.full_name,
      role: row.job_role?.name ?? "-",
      status: att?.status ?? null,
      updatedAt: att?.updated_at ?? null,
    });
    staffByBranch.set(branchId, list);
  }

  return branches.map((b) => {
    // Yang terakhir diabsen tampil paling atas, sisanya urut NIK.
    const staff = (staffByBranch.get(b.id) ?? []).sort((x, y) => {
      if (x.updatedAt && y.updatedAt) return y.updatedAt.localeCompare(x.updatedAt);
      if (x.updatedAt) return -1;
      if (y.updatedAt) return 1;
      return x.nik.localeCompare(y.nik);
    });
    const count = (s: AttendanceStatus | null) => staff.filter((x) => x.status === s).length;
    const hadir = count("hadir");
    return {
      ...b,
      total: staff.length,
      hadir,
      sakit: count("sakit"),
      tidakHadir: count("tidak_hadir"),
      belum: count(null),
      percent: staff.length ? Math.round((hadir / staff.length) * 100) : null,
      staff,
      lastUpdate: staff[0]?.updatedAt ?? null,
    };
  });
}

export type RangeSummary = {
  from: string;
  to: string;
  days: number;
  staff: number;
  /** Staf × hari = jumlah absensi yang seharusnya terisi. */
  expected: number;
  hadir: number;
  sakit: number;
  tidakHadir: number;
  belum: number;
  percent: number | null; // hadir / expected
  filled: number | null; // terisi / expected
  /** Persentase hadir periode sebelumnya dengan panjang sama (pembanding). */
  prevPercent: number | null;
  branchCount: number;
  completeBranches: number;
  lowest: { code: string; percent: number } | null;
};

const PAGE = 1000;
const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Ringkasan kehadiran untuk rentang tanggal & cabang tertentu (`stats` = cabang dalam lingkup,
 * jumlah staf diambil dari tanggal akhir). Pembanding = periode sebelumnya yang sama panjang.
 */
export async function getRangeSummary(stats: BranchStats[], from: string, to: string): Promise<RangeSummary> {
  const supabase = await createClient();
  const days = dayDiff(from, to) + 1;
  const prevFrom = addDays(from, -days);
  const ids = stats.map((s) => s.id);

  type Row = { branch_id: string; status: AttendanceStatus; attendance_date: string };
  const rows: Row[] = [];
  if (ids.length) {
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await supabase
        .from("attendance_daily")
        .select("branch_id, status, attendance_date")
        .in("branch_id", ids)
        .gte("attendance_date", prevFrom)
        .lte("attendance_date", to)
        .order("id")
        .range(offset, offset + PAGE - 1);
      if (error) throw new Error(`Gagal memuat ringkasan absensi: ${error.message}`);
      rows.push(...((data ?? []) as Row[]));
      if (!data || data.length < PAGE) break;
    }
  }

  const current = rows.filter((r) => r.attendance_date >= from);
  const previous = rows.filter((r) => r.attendance_date < from);
  const staff = stats.reduce((n, s) => n + s.total, 0);
  const expected = staff * days;
  const count = (list: Row[], s: AttendanceStatus) => list.filter((r) => r.status === s).length;
  const hadir = count(current, "hadir");
  const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : null);

  const perBranch = stats
    .filter((s) => s.total > 0)
    .map((s) => {
      const mine = current.filter((r) => r.branch_id === s.id);
      return { code: s.code, recorded: mine.length, expected: s.total * days, percent: pct(count(mine, "hadir"), s.total * days) ?? 0 };
    });
  const lowest = [...perBranch].sort((a, b) => a.percent - b.percent)[0];

  return {
    from,
    to,
    days,
    staff,
    expected,
    hadir,
    sakit: count(current, "sakit"),
    tidakHadir: count(current, "tidak_hadir"),
    belum: Math.max(0, expected - current.length),
    percent: pct(hadir, expected),
    filled: pct(Math.min(current.length, expected), expected),
    prevPercent: pct(count(previous, "hadir"), expected),
    branchCount: perBranch.length,
    completeBranches: perBranch.filter((b) => b.recorded >= b.expected).length,
    lowest: lowest ? { code: lowest.code, percent: lowest.percent } : null,
  };
}
