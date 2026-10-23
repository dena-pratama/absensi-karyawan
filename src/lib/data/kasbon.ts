import "server-only";
import { todayWIB } from "@/lib/format";
import type { KasbonStatus } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import { getMyAccess } from "./access";

/** Bucket privat bukti pencairan (migrasi kasbon). */
export const KASBON_PROOF_BUCKET = "kasbon-proof";
const PROOF_URL_TTL = 60 * 60;
/** PostgREST: tabel / fungsi belum ada (migrasi kasbon belum dijalankan). */
const MISSING = new Set(["PGRST202", "PGRST205", "42883", "42P01"]);

export type KasbonQuota = {
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  baseSalary: number;
  salarySource: "karyawan" | "jabatan" | null; // null = gaji pokok belum diatur
  dailyDivisor: number;
  dailyRate: number;
  hk: number;
  plafon: number;
  used: number;
  available: number;
};

export type KasbonItem = {
  id: string;
  employeeId: string;
  name: string;
  nik: string;
  amount: number;
  note: string | null;
  status: KasbonStatus;
  /** Dicairkan dan periodenya sudah lewat → dianggap lunas lewat potong gaji. */
  autoSettled: boolean;
  periodStart: string;
  periodEnd: string;
  plafon: number;
  hk: number;
  requestedAt: string;
  decisionNote: string | null;
  decidedAt: string | null;
  disbursedAt: string | null;
  settledAt: string | null;
  proofUrl: string | null;
};

type Row = {
  id: string;
  employee_id: string;
  amount: number | string;
  note: string | null;
  status: KasbonStatus;
  period_start: string;
  period_end: string;
  plafon: number | string;
  hk: number;
  requested_at: string;
  decision_note: string | null;
  decided_at: string | null;
  disbursed_at: string | null;
  settled_at: string | null;
  proof_photo: string | null;
  employee: { nik: string; full_name: string } | null;
};

const LIST_LIMIT = 500;
const REPORT_LIMIT = 5000;
const COLUMNS =
  "id, employee_id, amount, note, status, period_start, period_end, plafon, hk, requested_at, decision_note, decided_at, disbursed_at, settled_at, proof_photo, employee:employee_id(nik, full_name)";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Ubah baris kasbon jadi KasbonItem, termasuk signed URL bukti & status lunas otomatis. */
async function toItems(supabase: Supabase, rows: Row[]): Promise<KasbonItem[]> {
  const paths = rows.map((r) => r.proof_photo).filter((p): p is string => Boolean(p));
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await supabase.storage.from(KASBON_PROOF_BUCKET).createSignedUrls(paths, PROOF_URL_TTL);
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }
  const today = todayWIB();
  return rows.map((r) => ({
    id: r.id,
    employeeId: r.employee_id,
    name: r.employee?.full_name ?? "-",
    nik: r.employee?.nik ?? "-",
    amount: Number(r.amount),
    note: r.note,
    status: r.status,
    autoSettled: r.status === "dicairkan" && r.period_end < today,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    plafon: Number(r.plafon),
    hk: r.hk,
    requestedAt: r.requested_at,
    decisionNote: r.decision_note,
    decidedAt: r.decided_at,
    disbursedAt: r.disbursed_at,
    settledAt: r.settled_at,
    proofUrl: r.proof_photo ? (urls.get(r.proof_photo) ?? null) : null,
  }));
}

/** Hasil rpc kasbon_quota (tabel 1 baris) → KasbonQuota. */
function toQuota(data: unknown): KasbonQuota | null {
  const q = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  if (!q) return null;
  return {
    employeeId: String(q.employee_id),
    periodStart: String(q.period_start),
    periodEnd: String(q.period_end),
    baseSalary: Number(q.base_salary),
    salarySource: (q.salary_source as KasbonQuota["salarySource"]) ?? null,
    dailyDivisor: Number(q.daily_divisor),
    dailyRate: Number(q.daily_rate),
    hk: Number(q.hk),
    plafon: Number(q.plafon),
    used: Number(q.used),
    available: Number(q.available),
  };
}

/**
 * Data halaman Kasbon: plafon akun yang login + riwayat kasbon
 * (admin: semua karyawan; selain admin: miliknya saja, dijaga RLS).
 */
export async function getKasbonPage() {
  const supabase = await createClient();
  const { role } = await getMyAccess();

  const [quotaRes, listRes] = await Promise.all([
    supabase.rpc("kasbon_quota"),
    supabase
      .from("kasbon")
      .select(COLUMNS)
      .order("requested_at", { ascending: false })
      .limit(LIST_LIMIT),
  ]);

  if (listRes.error && MISSING.has(listRes.error.code)) return { ready: false as const, role };
  if (listRes.error) throw new Error(`Gagal memuat kasbon: ${listRes.error.message}`);

  const quota = quotaRes.error ? null : toQuota(quotaRes.data);
  const quotaError = !quotaRes.error ? null : quotaRes.error.code === "P0001" ? quotaRes.error.message : "Gagal menghitung plafon kasbon.";

  const items = await toItems(supabase, (listRes.data ?? []) as unknown as Row[]);

  return { ready: true as const, role, quota, quotaError, items };
}

/** Laporan kasbon (admin): semua kasbon + periode gajian berjalan. */
export async function getKasbonReport() {
  const supabase = await createClient();
  const [list, period] = await Promise.all([
    supabase.from("kasbon").select(COLUMNS).order("requested_at", { ascending: false }).limit(REPORT_LIMIT),
    supabase.rpc("payroll_period"),
  ]);
  if (list.error && MISSING.has(list.error.code)) return { ready: false as const };
  if (list.error) throw new Error(`Gagal memuat laporan kasbon: ${list.error.message}`);
  const p = (Array.isArray(period.data) ? period.data[0] : period.data) as { period_start: string; period_end: string } | undefined;
  return {
    ready: true as const,
    items: await toItems(supabase, (list.data ?? []) as unknown as Row[]),
    currentPeriod: p ? { start: p.period_start, end: p.period_end } : null,
  };
}

const EMPLOYEE_HISTORY_LIMIT = 10;

/**
 * Riwayat kasbon satu karyawan (halaman Detail Karyawan).
 * Hanya untuk admin atau karyawan itu sendiri: RLS menyembunyikan kasbon orang lain dari SPV,
 * jadi visible=false supaya halaman tidak salah menampilkan "belum ada kasbon".
 */
export async function getEmployeeKasbon(employeeId: string) {
  const supabase = await createClient();
  const [{ role }, mine] = await Promise.all([getMyAccess(), supabase.rpc("my_linked_employee_id")]);
  if (mine.error && MISSING.has(mine.error.code)) return { visible: false as const };
  if (role !== "admin" && mine.data !== employeeId) return { visible: false as const };

  const [list, count, quotaRes] = await Promise.all([
    supabase.from("kasbon").select(COLUMNS).eq("employee_id", employeeId).order("requested_at", { ascending: false }).limit(EMPLOYEE_HISTORY_LIMIT),
    supabase.from("kasbon").select("id", { count: "exact", head: true }).eq("employee_id", employeeId),
    supabase.rpc("kasbon_quota", { p_employee: employeeId }),
  ]);
  if (list.error && MISSING.has(list.error.code)) return { visible: false as const };
  if (list.error) throw new Error(`Gagal memuat riwayat kasbon: ${list.error.message}`);

  return {
    visible: true as const,
    items: await toItems(supabase, (list.data ?? []) as unknown as Row[]),
    total: count.count ?? 0,
    quota: quotaRes.error ? null : toQuota(quotaRes.data), // null bila gaji / data belum lengkap
  };
}

export type PayrollSettings = {
  dailyDivisor: number;
  cutoffDay: number;
  roles: { id: string; name: string; salary: number | null }[];
  overrides: { employeeId: string; name: string; nik: string; salary: number }[];
};

/** Pengaturan gaji untuk kasbon (khusus admin). ready=false bila migrasi belum dijalankan. */
export async function getPayrollSettings(): Promise<{ ready: false } | ({ ready: true } & PayrollSettings)> {
  const supabase = await createClient();
  const [setting, roles, roleSalary, overrides] = await Promise.all([
    supabase.from("payroll_setting").select("daily_divisor, cutoff_day").maybeSingle(),
    supabase.from("job_role").select("id, name").eq("is_active", true).order("name"),
    supabase.from("job_role_salary").select("job_role_id, base_salary"),
    supabase.from("employee_salary").select("employee_id, base_salary, employee:employee_id(nik, full_name)"),
  ]);
  for (const r of [setting, roleSalary, overrides]) {
    if (r.error && MISSING.has(r.error.code)) return { ready: false };
    if (r.error) throw new Error(`Gagal memuat pengaturan kasbon: ${r.error.message}`);
  }
  if (roles.error) throw new Error(`Gagal memuat jabatan: ${roles.error.message}`);

  const salaryOf = new Map((roleSalary.data ?? []).map((s) => [s.job_role_id as string, Number(s.base_salary)]));
  type Override = { employee_id: string; base_salary: number | string; employee: { nik: string; full_name: string } | null };
  return {
    ready: true,
    dailyDivisor: Number(setting.data?.daily_divisor ?? 26),
    cutoffDay: Number(setting.data?.cutoff_day ?? 25),
    roles: (roles.data ?? []).map((r) => ({ id: r.id as string, name: r.name as string, salary: salaryOf.get(r.id as string) ?? null })),
    overrides: ((overrides.data ?? []) as unknown as Override[])
      .map((o) => ({ employeeId: o.employee_id, name: o.employee?.full_name ?? "-", nik: o.employee?.nik ?? "-", salary: Number(o.base_salary) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
