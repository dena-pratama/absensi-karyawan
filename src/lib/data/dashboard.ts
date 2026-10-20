import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AttendanceStatus } from "@/lib/labels";
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
  status: AttendanceStatus;
  updated_at: string;
};

/**
 * Rekap kehadiran hari ini per cabang.
 * Roster = penempatan aktif (valid_to NULL) dari karyawan yang masih aktif.
 */
export async function getDashboardStats(branches: BranchSummary[], date: string): Promise<BranchStats[]> {
  const supabase = await createClient();
  const [assignRes, attRes] = await Promise.all([
    supabase
      .from("employee_assignment")
      .select("employee_id, branch_id, employee:employee_id!inner(nik, full_name), job_role:job_role_id(name)")
      .is("valid_to", null)
      .eq("employee.is_active", true),
    supabase.from("attendance_daily").select("employee_id, status, updated_at").eq("attendance_date", date),
  ]);
  if (assignRes.error) throw new Error(`Gagal memuat penempatan karyawan: ${assignRes.error.message}`);
  if (attRes.error) throw new Error(`Gagal memuat absensi: ${attRes.error.message}`);

  const attendance = new Map(
    ((attRes.data ?? []) as AttendanceRow[]).map((a) => [a.employee_id, a]),
  );
  const staffByBranch = new Map<string, StaffToday[]>();
  for (const row of (assignRes.data ?? []) as unknown as AssignmentRow[]) {
    if (!row.employee) continue;
    const att = attendance.get(row.employee_id);
    const list = staffByBranch.get(row.branch_id) ?? [];
    list.push({
      employeeId: row.employee_id,
      nik: row.employee.nik,
      name: row.employee.full_name,
      role: row.job_role?.name ?? "-",
      status: att?.status ?? null,
      updatedAt: att?.updated_at ?? null,
    });
    staffByBranch.set(row.branch_id, list);
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
