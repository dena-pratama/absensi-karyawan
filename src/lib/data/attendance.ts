import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AttendanceStatus } from "@/lib/labels";

export type JobRole = { id: string; code: string; name: string };

export type RosterEntry = {
  employeeId: string;
  nik: string;
  name: string;
  phone: string | null;
  contract: "tetap" | "pkwt" | "mitra";
  joinDate: string | null;
  roleId: string;
  roleName: string;
  /** Cabang penempatan (bukan cabang backup / tempat absen). */
  branchId: string;
};

export type AttendanceEntry = {
  employeeId: string;
  /** Cabang tempat absen dicatat (bisa cabang backup). */
  branchId: string;
  date: string;
  status: AttendanceStatus;
  note: string | null;
  updatedAt: string;
};

type AssignmentRow = {
  employee_id: string;
  branch_id: string;
  job_role_id: string;
  employee: {
    nik: string;
    full_name: string;
    phone_wa: string | null;
    contract_type: RosterEntry["contract"];
    join_date: string | null;
  } | null;
  job_role: { name: string } | null;
};

type AttendanceRow = {
  employee_id: string;
  branch_id: string;
  attendance_date: string;
  status: AttendanceStatus;
  note: string | null;
  updated_at: string;
};

export async function getJobRoles(): Promise<JobRole[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_role")
    .select("id, code, name")
    .eq("is_active", true)
    .order("name");
  if (error) throw new Error(`Gagal memuat jabatan: ${error.message}`);
  return (data ?? []) as JobRole[];
}

/**
 * Karyawan aktif yang ditempatkan di cabang pada rentang tanggal [from, to].
 * Untuk satu hari: from = to = tanggal itu.
 */
export async function getRoster(branchId: string, from: string, to: string = from): Promise<RosterEntry[]> {
  return queryRoster({ branchId }, from, to);
}

/** Penempatan (cabang mana pun) karyawan tertentu pada rentang tanggal — dipakai untuk karyawan backup. */
export async function getRosterForEmployees(employeeIds: string[], from: string, to: string = from): Promise<RosterEntry[]> {
  if (employeeIds.length === 0) return [];
  return queryRoster({ employeeIds }, from, to);
}

async function queryRoster(
  by: { branchId: string } | { employeeIds: string[] },
  from: string,
  to: string,
): Promise<RosterEntry[]> {
  const supabase = await createClient();
  let q = supabase
    .from("employee_assignment")
    .select(
      "employee_id, branch_id, job_role_id, employee:employee_id!inner(nik, full_name, phone_wa, contract_type, join_date), job_role:job_role_id(name)",
    )
    .eq("employee.is_active", true)
    .lte("valid_from", to)
    .or(`valid_to.is.null,valid_to.gte.${from}`)
    .order("valid_from", { ascending: false });
  q = "branchId" in by ? q.eq("branch_id", by.branchId) : q.in("employee_id", by.employeeIds);
  const { data, error } = await q;
  if (error) throw new Error(`Gagal memuat daftar karyawan: ${error.message}`);

  // Satu karyawan bisa punya >1 penempatan dalam rentang (mutasi) → ambil yang terbaru.
  const seen = new Set<string>();
  const roster: RosterEntry[] = [];
  for (const row of (data ?? []) as unknown as AssignmentRow[]) {
    if (!row.employee || seen.has(row.employee_id)) continue;
    seen.add(row.employee_id);
    roster.push({
      employeeId: row.employee_id,
      nik: row.employee.nik,
      name: row.employee.full_name,
      phone: row.employee.phone_wa,
      contract: row.employee.contract_type,
      joinDate: row.employee.join_date,
      roleId: row.job_role_id,
      roleName: row.job_role?.name ?? "-",
      branchId: row.branch_id,
    });
  }
  return roster.sort((a, b) => a.nik.localeCompare(b.nik));
}

/** Absensi karyawan tertentu dalam rentang tanggal. */
export async function getAttendance(employeeIds: string[], from: string, to: string = from): Promise<AttendanceEntry[]> {
  if (employeeIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance_daily")
    .select("employee_id, branch_id, attendance_date, status, note, updated_at")
    .in("employee_id", employeeIds)
    .gte("attendance_date", from)
    .lte("attendance_date", to);
  if (error) throw new Error(`Gagal memuat absensi: ${error.message}`);
  return ((data ?? []) as AttendanceRow[]).map((r) => ({
    employeeId: r.employee_id,
    branchId: r.branch_id,
    date: r.attendance_date,
    status: r.status,
    note: r.note,
    updatedAt: r.updated_at,
  }));
}

/** Hitung hadir/sakit/tidak hadir + persentase (hadir ÷ hari tercatat). */
export function summarize(entries: { status: AttendanceStatus }[]) {
  const hadir = entries.filter((e) => e.status === "hadir").length;
  const sakit = entries.filter((e) => e.status === "sakit").length;
  const tidakHadir = entries.filter((e) => e.status === "tidak_hadir").length;
  const libur = entries.filter((e) => e.status === "libur").length;
  const total = entries.length;
  // Hari libur tidak dihitung sebagai hari kerja: % hadir = hadir / (hari terisi - libur)
  const workdays = total - libur;
  return { hadir, sakit, tidakHadir, libur, total, percent: workdays ? Math.round((hadir / workdays) * 1000) / 10 : null };
}
