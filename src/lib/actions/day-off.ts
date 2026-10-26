"use server";

import { revalidatePath } from "next/cache";
import { READ_ONLY_ERROR, isAdmin } from "@/lib/data/access";
import { createClient } from "@/lib/supabase/server";

export type DayOffResult = { ok: true } | { ok: false; error: string };

/** Pesan dari fungsi day_off_* (P0001 / 42501) aman ditampilkan apa adanya. */
function friendly(error: { code?: string; message: string }, fallback: string) {
  if (error.code === "P0001" || error.code === "42501") return error.message;
  if (error.code === "PGRST202" || error.code === "PGRST205") return "Fitur libur belum aktif. Jalankan migrasi day_off di Supabase.";
  return fallback;
}

const done = (): DayOffResult => {
  revalidatePath("/", "layout");
  return { ok: true };
};

/** Admin: setujui / tolak pengajuan libur (SPV & Office memproses lewat app). */
export async function decideDayOff(id: string, approve: boolean, note: string): Promise<DayOffResult> {
  if (!(await isAdmin())) return { ok: false, error: READ_ONLY_ERROR };
  const supabase = await createClient();
  const { error } = await supabase.rpc("day_off_decide", { p_id: id, p_approve: approve, p_note: note.trim().slice(0, 200) || null });
  return error ? { ok: false, error: friendly(error, "Gagal memproses libur.") } : done();
}

/** Admin: setujui / tolak tukar off yang sudah dikonfirmasi rekan. */
export async function decideSwap(id: string, approve: boolean): Promise<DayOffResult> {
  if (!(await isAdmin())) return { ok: false, error: READ_ONLY_ERROR };
  const supabase = await createClient();
  const { error } = await supabase.rpc("day_off_swap_decide", { p_id: id, p_approve: approve });
  return error ? { ok: false, error: friendly(error, "Gagal memproses tukar off.") } : done();
}

export type DayOffSettingsInput = {
  compValidDays: number;
  roles: { id: string; days: number | null }[]; // null = hapus
  overrides: { employeeId: string; days: number | null }[];
};

const validDays = (n: number | null) => n === null || (Number.isInteger(n) && n >= 0 && n <= 31);

/** Admin: simpan jatah libur per jabatan, override per karyawan, dan masa berlaku off pengganti. */
export async function saveDayOffSettings(input: DayOffSettingsInput): Promise<DayOffResult> {
  if (!(await isAdmin())) return { ok: false, error: READ_ONLY_ERROR };
  if (!Number.isInteger(input.compValidDays) || input.compValidDays < 1 || input.compValidDays > 365) {
    return { ok: false, error: "Masa berlaku off pengganti harus 1 sampai 365 hari." };
  }
  if (![...input.roles, ...input.overrides].every((r) => validDays(r.days))) {
    return { ok: false, error: "Jatah libur harus 0 sampai 31 hari per periode." };
  }
  const supabase = await createClient();
  const fail = (e: { code?: string; message: string }) => ({ ok: false as const, error: friendly(e, "Gagal menyimpan pengaturan libur.") });

  const setting = await supabase.from("day_off_setting").upsert({ id: true, comp_valid_days: input.compValidDays });
  if (setting.error) return fail(setting.error);

  const roleSet = input.roles.filter((r) => r.days !== null).map((r) => ({ job_role_id: r.id, days: r.days }));
  const roleDel = input.roles.filter((r) => r.days === null).map((r) => r.id);
  const empSet = input.overrides.filter((o) => o.days !== null).map((o) => ({ employee_id: o.employeeId, days: o.days }));
  const empDel = input.overrides.filter((o) => o.days === null).map((o) => o.employeeId);
  for (const res of await Promise.all([
    roleSet.length ? supabase.from("job_role_day_off").upsert(roleSet) : null,
    roleDel.length ? supabase.from("job_role_day_off").delete().in("job_role_id", roleDel) : null,
    empSet.length ? supabase.from("employee_day_off").upsert(empSet) : null,
    empDel.length ? supabase.from("employee_day_off").delete().in("employee_id", empDel) : null,
  ])) {
    if (res?.error) return fail(res.error);
  }
  return done();
}
