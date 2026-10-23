"use server";

import { revalidatePath } from "next/cache";
import { READ_ONLY_ERROR, isAdmin } from "@/lib/data/access";
import { KASBON_PROOF_BUCKET } from "@/lib/data/kasbon";
import { createClient } from "@/lib/supabase/server";

export type KasbonResult = { ok: true } | { ok: false; error: string };

const NOTE_MAX = 200;
const SALARY_MAX = 1_000_000_000;
/** Server action dibatasi ±1 MB; foto dikompres di browser sebelum dikirim. */
const PROOF_MAX_BYTES = 950 * 1024;
const PROOF_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Pesan dari fungsi kasbon_* (P0001 / 42501) aman ditampilkan apa adanya. */
function friendly(error: { code?: string; message: string }, fallback: string) {
  if (error.code === "P0001" || error.code === "42501") return error.message;
  if (error.code === "PGRST202" || error.code === "PGRST205" || error.code === "42P01") {
    return "Fitur kasbon belum aktif. Jalankan migrasi kasbon di Supabase.";
  }
  return fallback;
}

function done(): KasbonResult {
  revalidatePath("/kasbon", "layout");
  revalidatePath("/laporan/kasbon");
  return { ok: true };
}

/** Ajukan kasbon untuk diri sendiri (semua role). Plafon dicek di database. */
export async function requestKasbon(amount: number, note: string): Promise<KasbonResult> {
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, error: "Nominal kasbon harus angka rupiah lebih dari 0." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("kasbon_request", { p_amount: amount, p_note: note.trim().slice(0, NOTE_MAX) || null });
  if (error) return { ok: false, error: friendly(error, "Gagal mengajukan kasbon.") };
  return done();
}

export async function cancelKasbon(id: string): Promise<KasbonResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("kasbon_cancel", { p_id: id });
  if (error) return { ok: false, error: friendly(error, "Gagal membatalkan kasbon.") };
  return done();
}

export async function decideKasbon(id: string, approve: boolean, note: string): Promise<KasbonResult> {
  if (!(await isAdmin())) return { ok: false, error: READ_ONLY_ERROR };
  const supabase = await createClient();
  const { error } = await supabase.rpc("kasbon_decide", { p_id: id, p_approve: approve, p_note: note.trim().slice(0, NOTE_MAX) || null });
  if (error) return { ok: false, error: friendly(error, "Gagal memproses kasbon.") };
  return done();
}

/** Admin: unggah bukti pencairan lalu tandai dicairkan. */
export async function disburseKasbon(form: FormData): Promise<KasbonResult> {
  if (!(await isAdmin())) return { ok: false, error: READ_ONLY_ERROR };
  const id = String(form.get("id") ?? "");
  const employeeId = String(form.get("employeeId") ?? "");
  const file = form.get("proof");
  if (!id || !employeeId) return { ok: false, error: "Data kasbon tidak lengkap." };
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Pilih foto bukti pencairan." };
  if (!PROOF_TYPES.has(file.type)) return { ok: false, error: "Bukti harus berupa foto (JPG, PNG, atau WEBP)." };
  if (file.size > PROOF_MAX_BYTES) return { ok: false, error: "Ukuran foto terlalu besar." };

  const supabase = await createClient();
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${employeeId}/${id}-${Date.now()}.${ext}`;
  const upload = await supabase.storage.from(KASBON_PROOF_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (upload.error) return { ok: false, error: "Gagal mengunggah bukti. Pastikan migrasi kasbon sudah dijalankan." };

  const { error } = await supabase.rpc("kasbon_disburse", { p_id: id, p_photo: path });
  if (error) {
    await supabase.storage.from(KASBON_PROOF_BUCKET).remove([path]); // jangan tinggalkan foto yatim
    return { ok: false, error: friendly(error, "Gagal mencairkan kasbon.") };
  }
  return done();
}

export async function settleKasbon(id: string): Promise<KasbonResult> {
  if (!(await isAdmin())) return { ok: false, error: READ_ONLY_ERROR };
  const supabase = await createClient();
  const { error } = await supabase.rpc("kasbon_settle", { p_id: id });
  if (error) return { ok: false, error: friendly(error, "Gagal menandai lunas.") };
  return done();
}

export type PayrollInput = {
  dailyDivisor: number;
  cutoffDay: number;
  /** job_role_id → gaji pokok; null = hapus */
  roles: { id: string; salary: number | null }[];
  /** override per karyawan; salary null = hapus */
  overrides: { employeeId: string; salary: number | null }[];
};

const validSalary = (n: number | null) => n === null || (Number.isInteger(n) && n >= 0 && n <= SALARY_MAX);

/** Admin: simpan pembagi, cut-off, gaji per jabatan & override per karyawan. */
export async function savePayrollSettings(input: PayrollInput): Promise<KasbonResult> {
  if (!(await isAdmin())) return { ok: false, error: READ_ONLY_ERROR };
  if (!Number.isInteger(input.dailyDivisor) || input.dailyDivisor < 1 || input.dailyDivisor > 31) {
    return { ok: false, error: "Pembagi harian harus 1 sampai 31." };
  }
  if (!Number.isInteger(input.cutoffDay) || !((input.cutoffDay >= 1 && input.cutoffDay <= 28) || input.cutoffDay === 31)) {
    return { ok: false, error: "Tanggal cut-off harus 1 sampai 28, atau akhir bulan." };
  }
  if (![...input.roles, ...input.overrides].every((r) => validSalary(r.salary))) {
    return { ok: false, error: "Gaji pokok harus angka rupiah 0 sampai 1 miliar." };
  }

  const supabase = await createClient();
  const fail = (error: { code?: string; message: string }) => ({ ok: false as const, error: friendly(error, "Gagal menyimpan pengaturan kasbon.") });

  const setting = await supabase.from("payroll_setting").upsert({ id: true, daily_divisor: input.dailyDivisor, cutoff_day: input.cutoffDay });
  if (setting.error) return fail(setting.error);

  const roleSet = input.roles.filter((r) => r.salary !== null).map((r) => ({ job_role_id: r.id, base_salary: r.salary }));
  const roleDel = input.roles.filter((r) => r.salary === null).map((r) => r.id);
  const empSet = input.overrides.filter((o) => o.salary !== null).map((o) => ({ employee_id: o.employeeId, base_salary: o.salary }));
  const empDel = input.overrides.filter((o) => o.salary === null).map((o) => o.employeeId);

  for (const res of await Promise.all([
    roleSet.length ? supabase.from("job_role_salary").upsert(roleSet) : null,
    roleDel.length ? supabase.from("job_role_salary").delete().in("job_role_id", roleDel) : null,
    empSet.length ? supabase.from("employee_salary").upsert(empSet) : null,
    empDel.length ? supabase.from("employee_salary").delete().in("employee_id", empDel) : null,
  ])) {
    if (res?.error) return fail(res.error);
  }
  return done();
}
