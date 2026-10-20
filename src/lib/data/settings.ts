import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { BranchType } from "@/lib/labels";

/* Tipe data yang dikirim ke halaman Pengaturan (juga dipakai client untuk staging). */

export type EmployeeSetting = {
  id: string;
  nik: string;
  name: string;
  phone: string; // digit lokal tanpa +62, "" kalau kosong
  contract: "tetap" | "pkwt" | "mitra";
  joinDate: string; // "" kalau kosong
  isActive: boolean;
  branchId: string; // "" kalau belum ditempatkan
  roleId: string;
};

export type BranchSetting = {
  id: string;
  code: string;
  name: string;
  type: BranchType;
  clusterId: string;
  address: string;
  picId: string;
  is24: boolean;
  open: string; // "HH:MM"
  close: string;
  active: boolean;
  originalStatus: "aktif" | "maintenance" | "nonaktif";
  staffCount: number;
};

export type RoleSetting = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  staffCount: number;
};

export type Option = { id: string; label: string; sub?: string };

export type AuditItem = {
  id: number;
  table: string;
  action: "insert" | "update" | "delete";
  label: string;
  changedAt: string;
};

async function client() {
  return createClient();
}

/** Penempatan aktif semua karyawan → map employeeId → {branchId, roleId}. */
async function activeAssignments() {
  const supabase = await client();
  const { data, error } = await supabase
    .from("employee_assignment")
    .select("employee_id, branch_id, job_role_id")
    .is("valid_to", null);
  if (error) throw new Error(`Gagal memuat penempatan: ${error.message}`);
  return (data ?? []) as { employee_id: string; branch_id: string; job_role_id: string }[];
}

export async function getEmployeeSettings(): Promise<EmployeeSetting[]> {
  const supabase = await client();
  const [{ data, error }, assignments] = await Promise.all([
    supabase.from("employee").select("id, nik, full_name, phone_wa, contract_type, join_date, is_active").order("nik"),
    activeAssignments(),
  ]);
  if (error) throw new Error(`Gagal memuat karyawan: ${error.message}`);
  const byEmployee = new Map(assignments.map((a) => [a.employee_id, a]));

  return (data ?? []).map((e) => {
    const a = byEmployee.get(e.id as string);
    return {
      id: e.id as string,
      nik: e.nik as string,
      name: e.full_name as string,
      phone: ((e.phone_wa as string | null) ?? "").replace(/^\+62/, ""),
      contract: e.contract_type as EmployeeSetting["contract"],
      joinDate: (e.join_date as string | null) ?? "",
      isActive: e.is_active as boolean,
      branchId: a?.branch_id ?? "",
      roleId: a?.job_role_id ?? "",
    };
  });
}

export async function getBranchSettings(): Promise<BranchSetting[]> {
  const supabase = await client();
  const [{ data, error }, assignments] = await Promise.all([
    supabase
      .from("branch")
      .select("id, code, name, branch_type, cluster_id, address, pic_employee_id, is_24_hours, gate_open_time, gate_close_time, status")
      .order("code"),
    activeAssignments(),
  ]);
  if (error) throw new Error(`Gagal memuat cabang: ${error.message}`);

  return (data ?? []).map((b) => ({
    id: b.id as string,
    code: b.code as string,
    name: b.name as string,
    type: b.branch_type as BranchType,
    clusterId: (b.cluster_id as string | null) ?? "",
    address: (b.address as string | null) ?? "",
    picId: (b.pic_employee_id as string | null) ?? "",
    is24: b.is_24_hours as boolean,
    open: ((b.gate_open_time as string | null) ?? "").slice(0, 5),
    close: ((b.gate_close_time as string | null) ?? "").slice(0, 5),
    active: b.status !== "nonaktif",
    originalStatus: b.status as BranchSetting["originalStatus"],
    staffCount: assignments.filter((a) => a.branch_id === b.id).length,
  }));
}

export async function getRoleSettings(): Promise<RoleSetting[]> {
  const supabase = await client();
  const [{ data, error }, assignments] = await Promise.all([
    supabase.from("job_role").select("id, code, name, is_active").order("name"),
    activeAssignments(),
  ]);
  if (error) throw new Error(`Gagal memuat jabatan: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    code: r.code as string,
    name: r.name as string,
    isActive: r.is_active as boolean,
    staffCount: assignments.filter((a) => a.job_role_id === r.id).length,
  }));
}

export async function getClusterOptions(): Promise<Option[]> {
  const supabase = await client();
  const { data, error } = await supabase.from("cluster").select("id, name").order("name");
  if (error) throw new Error(`Gagal memuat cluster: ${error.message}`);
  return (data ?? []).map((c) => ({ id: c.id as string, label: c.name as string }));
}

/** Log perubahan master data terbaru (diisi trigger audit). */
export async function getRecentAudit(limit = 8): Promise<AuditItem[]> {
  const supabase = await client();
  const { data, error } = await supabase
    .from("audit_log")
    .select("id, table_name, action, old_data, new_data, changed_at")
    .order("changed_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Gagal memuat log perubahan: ${error.message}`);

  return (data ?? []).map((row) => {
    const rec = (row.new_data ?? row.old_data ?? {}) as Record<string, unknown>;
    const label =
      row.table_name === "employee"
        ? `${rec.nik ?? ""} ${rec.full_name ?? ""}`
        : row.table_name === "branch"
          ? `${rec.code ?? ""} ${rec.name ?? ""}`
          : `${rec.name ?? rec.code ?? ""}`;
    return {
      id: row.id as number,
      table: row.table_name as string,
      action: row.action as AuditItem["action"],
      label: label.trim(),
      changedAt: row.changed_at as string,
    };
  });
}

/** Ringkasan jumlah untuk badge tab Pengaturan. */
export async function getSettingsCounts() {
  const supabase = await client();
  const head = { count: "exact" as const, head: true };
  const [e, b, r] = await Promise.all([
    supabase.from("employee").select("id", head),
    supabase.from("branch").select("id", head),
    supabase.from("job_role").select("id", head),
  ]);
  return { employees: e.count ?? 0, branches: b.count ?? 0, roles: r.count ?? 0 };
}
