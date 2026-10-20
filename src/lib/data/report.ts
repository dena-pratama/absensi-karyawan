import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AttendanceStatus } from "@/lib/labels";
import type { ReportFilters } from "@/lib/report-filters";
import { summarize } from "./attendance";

export type ReportRow = {
  date: string;
  employeeId: string;
  nik: string;
  name: string;
  role: string;
  branchCode: string;
  branchName: string;
  status: AttendanceStatus;
  note: string;
  updatedAt: string;
};

export type ReportEmployee = {
  employeeId: string;
  nik: string;
  name: string;
  role: string;
  branches: string; // "JKT109A" atau "JKT109A, BDO004A" kalau mutasi di periode ini
  hadir: number;
  sakit: number;
  tidakHadir: number;
  total: number;
  percent: number | null;
};

export type ReportData = {
  filters: ReportFilters;
  branchLabel: string;
  employeeLabel: string;
  rows: ReportRow[];
  employees: ReportEmployee[];
  totals: ReturnType<typeof summarize> & { employees: number; days: number };
};

type Raw = {
  attendance_date: string;
  employee_id: string;
  status: AttendanceStatus;
  note: string | null;
  updated_at: string;
  employee: { nik: string; full_name: string } | null;
  branch: { code: string; name: string } | null;
  job_role: { name: string } | null;
};

const PAGE = 1000; // batas default baris per request PostgREST

export type ReportOptions = {
  branches: { id: string; label: string }[];
  employees: { id: string; label: string; branchId: string }[];
};

/** Pilihan filter: semua cabang & semua karyawan (dengan cabang penempatan saat ini). */
export async function getReportOptions(): Promise<ReportOptions> {
  const supabase = await createClient();
  const [b, e, a] = await Promise.all([
    supabase.from("branch").select("id, code, name").order("code"),
    supabase.from("employee").select("id, nik, full_name").order("full_name"),
    supabase.from("employee_assignment").select("employee_id, branch_id").is("valid_to", null),
  ]);
  if (b.error || e.error || a.error) throw new Error("Gagal memuat pilihan filter laporan.");
  const branchOf = new Map((a.data ?? []).map((x) => [x.employee_id as string, x.branch_id as string]));
  return {
    branches: (b.data ?? []).map((x) => ({ id: x.id as string, label: `${x.code} - ${x.name}` })),
    employees: (e.data ?? []).map((x) => ({
      id: x.id as string,
      label: `${x.full_name} (${x.nik})`,
      branchId: branchOf.get(x.id as string) ?? "",
    })),
  };
}

/** Tarik data absensi sesuai filter (semua halaman), plus ringkasan per karyawan. */
export async function getReportData(filters: ReportFilters, options: ReportOptions): Promise<ReportData> {
  const supabase = await createClient();
  const raw: Raw[] = [];

  for (let offset = 0; ; offset += PAGE) {
    let q = supabase
      .from("attendance_daily")
      .select(
        "attendance_date, employee_id, status, note, updated_at, employee:employee_id(nik, full_name), branch:branch_id(code, name), job_role:job_role_id(name)",
      )
      .gte("attendance_date", filters.from)
      .lte("attendance_date", filters.to)
      .order("attendance_date")
      .order("id")
      .range(offset, offset + PAGE - 1);
    if (filters.branchId) q = q.eq("branch_id", filters.branchId);
    if (filters.employeeId) q = q.eq("employee_id", filters.employeeId);
    if (filters.status) q = q.eq("status", filters.status);

    const { data, error } = await q;
    if (error) throw new Error(`Gagal menarik data laporan: ${error.message}`);
    raw.push(...((data ?? []) as unknown as Raw[]));
    if (!data || data.length < PAGE) break;
  }

  const rows: ReportRow[] = raw
    .map((r) => ({
      date: r.attendance_date,
      employeeId: r.employee_id,
      nik: r.employee?.nik ?? "-",
      name: r.employee?.full_name ?? "-",
      role: r.job_role?.name ?? "-",
      branchCode: r.branch?.code ?? "-",
      branchName: r.branch?.name ?? "-",
      status: r.status,
      note: r.note ?? "",
      updatedAt: r.updated_at,
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.branchCode.localeCompare(b.branchCode) || a.nik.localeCompare(b.nik));

  const grouped = new Map<string, ReportRow[]>();
  for (const r of rows) {
    const list = grouped.get(r.employeeId) ?? [];
    list.push(r);
    grouped.set(r.employeeId, list);
  }
  const employees: ReportEmployee[] = [...grouped.values()]
    .map((list) => {
      const last = list[list.length - 1];
      const s = summarize(list);
      return {
        employeeId: last.employeeId,
        nik: last.nik,
        name: last.name,
        role: last.role,
        branches: [...new Set(list.map((r) => r.branchCode))].join(", "),
        ...s,
      };
    })
    .sort((a, b) => a.branches.localeCompare(b.branches) || a.nik.localeCompare(b.nik));

  return {
    filters,
    branchLabel: options.branches.find((b) => b.id === filters.branchId)?.label ?? "Semua Cabang",
    employeeLabel: options.employees.find((e) => e.id === filters.employeeId)?.label ?? "Semua Karyawan",
    rows,
    employees,
    totals: { ...summarize(rows), employees: employees.length, days: new Set(rows.map((r) => r.date)).size },
  };
}

