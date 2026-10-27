import "server-only";
import { createClient } from "@/lib/supabase/server";
import { todayWIB } from "@/lib/format";
import { GEOFENCE_DEFAULT_M, type LatLng } from "@/lib/geo";
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
  branchId: string; // "" kalau belum ditempatkan — penempatan yang berlaku HARI INI
  roleId: string;
  /** Mutasi terjadwal (penempatan yang mulai setelah hari ini). */
  scheduled: { branchId: string; roleId: string; from: string } | null;
  /** Hari libur tetap mingguan (0 Minggu ... 6 Sabtu), penanda di Rekap Bulanan. */
  dayOff: number[];
  /** Form saja: tanggal efektif mutasi bila cabang/jabatan diubah ("" = hari ini). */
  moveDate: string;
  /** Form saja: batalkan mutasi terjadwal. */
  cancelScheduled: boolean;
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
  /** Titik pusat area GPS absen; null = belum diatur. */
  point: LatLng | null;
  /** Radius area GPS absen (meter). */
  radius: number;
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

type AssignmentLite = { employee_id: string; branch_id: string; job_role_id: string; valid_from: string };

/** Penempatan yang berlaku hari ini (bukan "valid_to kosong", supaya mutasi terjadwal tidak terhitung dulu). */
async function activeAssignments() {
  return (await assignmentsFrom()).current;
}

/** Penempatan hari ini + penempatan terjadwal (mulai setelah hari ini). */
async function assignmentsFrom() {
  const supabase = await client();
  const today = todayWIB();
  const { data, error } = await supabase
    .from("employee_assignment")
    .select("employee_id, branch_id, job_role_id, valid_from, valid_to")
    .or(`valid_to.is.null,valid_to.gte.${today}`);
  if (error) throw new Error(`Gagal memuat penempatan: ${error.message}`);
  const rows = (data ?? []) as (AssignmentLite & { valid_to: string | null })[];
  return {
    current: rows.filter((a) => a.valid_from <= today),
    scheduled: rows.filter((a) => a.valid_from > today).sort((a, b) => a.valid_from.localeCompare(b.valid_from)),
  };
}

export async function getEmployeeSettings(): Promise<EmployeeSetting[]> {
  const supabase = await client();
  const cols = "id, nik, full_name, phone_wa, contract_type, join_date, is_active";
  const query = (c: string) => supabase.from("employee").select(c).order("nik");
  const [first, assignments] = await Promise.all([query(`${cols}, day_off_weekdays`), assignmentsFrom()]);
  // Kolom hari libur tetap belum ada (migrasi weekly_day_off belum dijalankan) → muat tanpa kolom itu.
  const res = first.error?.code === "42703" ? await query(cols) : first;
  const { error } = res;
  const data = res.data as unknown as Record<string, unknown>[] | null;
  if (error) throw new Error(`Gagal memuat karyawan: ${error.message}`);
  const byEmployee = new Map(assignments.current.map((a) => [a.employee_id, a]));
  const scheduledBy = new Map<string, AssignmentLite>();
  for (const a of assignments.scheduled) if (!scheduledBy.has(a.employee_id)) scheduledBy.set(a.employee_id, a);

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
      dayOff: ((e.day_off_weekdays as number[] | undefined) ?? []).map(Number).sort((x, y) => ((x + 6) % 7) - ((y + 6) % 7)),
      branchId: a?.branch_id ?? "",
      roleId: a?.job_role_id ?? "",
      scheduled: (() => {
        const s = scheduledBy.get(e.id as string);
        return s ? { branchId: s.branch_id, roleId: s.job_role_id, from: s.valid_from } : null;
      })(),
      moveDate: "",
      cancelScheduled: false,
    };
  });
}

const BRANCH_COLUMNS =
  "id, code, name, branch_type, cluster_id, address, pic_employee_id, is_24_hours, gate_open_time, gate_close_time, status";
const GEO_COLUMNS = "latitude, longitude, geofence_radius_m";

/**
 * Data cabang untuk Pengaturan. geoReady=false bila kolom area GPS belum ada
 * (migrasi branch_geofence belum dijalankan) — halaman tetap jalan tanpa GPS.
 */
export async function getBranchSettings(): Promise<{ branches: BranchSetting[]; geoReady: boolean }> {
  const supabase = await client();
  const [first, assignments] = await Promise.all([
    supabase.from("branch").select(`${BRANCH_COLUMNS}, ${GEO_COLUMNS}`).order("code"),
    activeAssignments(),
  ]);
  // 42703 = kolom tidak ada
  const geoReady = first.error?.code !== "42703";
  const { data, error } = geoReady ? first : await supabase.from("branch").select(BRANCH_COLUMNS).order("code");
  if (error) throw new Error(`Gagal memuat cabang: ${error.message}`);

  const branches = (data ?? []).map((row) => {
    const b = row as typeof row & { latitude?: number | null; longitude?: number | null; geofence_radius_m?: number };
    return {
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
      point: b.latitude != null && b.longitude != null ? { lat: b.latitude, lng: b.longitude } : null,
      radius: b.geofence_radius_m ?? GEOFENCE_DEFAULT_M,
    };
  });
  return { branches, geoReady };
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
