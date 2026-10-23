"use server";

import { revalidatePath } from "next/cache";
import type { AppRole } from "@/lib/labels";
import { displayLogin, PASSWORD_MIN, toLoginEmail, USERNAME_HINT } from "@/lib/login-id";
import { createAdminAuthClient, isAdminApiConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type AccessChange = {
  userId: string;
  role: AppRole | ""; // "" = cabut akses
  /** Cabang SPV (boleh lebih dari satu; yang pertama = cabang utama). */
  branchIds: string[];
  employeeId: string;
};

export type AccessResult = { ok: true; applied: number } | { ok: false; error: string; applied: number };

const ROLES: AppRole[] = ["admin", "spv", "karyawan"];

function friendly(error: { code?: string; message: string }) {
  if (error.message.includes("Minimal harus ada satu admin")) return "Minimal harus ada satu admin.";
  if (error.code === "23505") return "Data karyawan itu sudah terhubung ke akun lain.";
  if (error.code === "23503") return "Cabang atau karyawan yang dipilih tidak ditemukan.";
  if (error.code === "42501") return "Hanya admin yang boleh mengubah hak akses.";
  return "Gagal menyimpan hak akses.";
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Samakan daftar cabang SPV di app_user_branch. Sebelum migrasi backup_and_multi_branch_spv
 * tabel itu belum ada: 1 cabang tetap jalan (lewat app_user.branch_id), lebih dari 1 ditolak.
 */
async function syncSpvBranches(supabase: Supabase, userId: string, branchIds: string[]): Promise<string | null> {
  const { error: dErr } = await supabase.from("app_user_branch").delete().eq("user_id", userId);
  if (dErr) {
    const missing = dErr.code === "PGRST205" || dErr.code === "42P01";
    if (missing && branchIds.length <= 1) return null;
    return missing ? "SPV lebih dari 1 cabang butuh migrasi backup_and_multi_branch_spv di Supabase." : friendly(dErr);
  }
  if (!branchIds.length) return null;
  const { error } = await supabase.from("app_user_branch").insert(branchIds.map((branch_id) => ({ user_id: userId, branch_id })));
  return error ? friendly(error) : null;
}

/** Simpan role / cakupan akun. Akun sendiri tidak bisa diubah (cegah terkunci dari panel). */
export async function saveUserAccess(changes: AccessChange[]): Promise<AccessResult> {
  if (changes.length === 0) return { ok: true, applied: 0 };

  const supabase = await createClient();
  const [{ data: auth }, { data: isAdmin }] = await Promise.all([supabase.auth.getClaims(), supabase.rpc("is_admin")]);
  const me = auth?.claims?.sub;
  if (!me) return { ok: false, error: "Sesi berakhir. Silakan masuk kembali.", applied: 0 };
  if (isAdmin !== true) return { ok: false, error: "Hanya admin yang boleh mengubah hak akses.", applied: 0 };

  let applied = 0;
  for (const c of changes) {
    if (c.userId === me) return { ok: false, error: "Hak akses akun sendiri tidak bisa diubah.", applied };
    if (c.role && !ROLES.includes(c.role)) return { ok: false, error: "Role tidak valid.", applied };
    if (c.role === "spv" && !c.branchIds.length) return { ok: false, error: "Pilih minimal 1 cabang untuk SPV.", applied };
    if (c.role === "karyawan" && !c.employeeId) return { ok: false, error: "Pilih data karyawan untuk akun karyawan.", applied };

    const { error } = c.role
      ? await supabase.from("app_user").upsert(
          {
            user_id: c.userId,
            role: c.role,
            branch_id: c.role === "spv" ? c.branchIds[0] : null,
            employee_id: c.role === "karyawan" || c.role === "spv" ? c.employeeId || null : null,
          },
          { onConflict: "user_id" },
        )
      : await supabase.from("app_user").delete().eq("user_id", c.userId);
    if (error) return { ok: false, error: friendly(error), applied };
    if (c.role) {
      const bErr = await syncSpvBranches(supabase, c.userId, c.role === "spv" ? c.branchIds : []);
      if (bErr) return { ok: false, error: bErr, applied };
    }
    applied++;
  }

  revalidatePath("/pengaturan/akses");
  return { ok: true, applied };
}

export type NewAccount = {
  /** Username (mis. "budi01") atau email. */
  login: string;
  password: string;
  role: AppRole;
  branchIds: string[];
  employeeId: string;
};

export type CreateResult = { ok: true; login: string } | { ok: false; error: string };

/**
 * Buat akun login baru (Supabase Auth, email sudah terkonfirmasi) + role-nya.
 * Username diubah menjadi email internal (lihat lib/login-id.ts).
 * Butuh SUPABASE_SECRET_KEY di server. Kalau menyimpan role gagal, akun dihapus lagi.
 */
export async function createUserAccount(input: NewAccount): Promise<CreateResult> {
  if (!isAdminApiConfigured) return { ok: false, error: "SUPABASE_SECRET_KEY belum diatur di server." };

  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (isAdmin !== true) return { ok: false, error: "Hanya admin yang boleh membuat akun." };

  const email = toLoginEmail(input.login);
  if (!email) return { ok: false, error: `Username tidak valid. ${USERNAME_HINT}` };
  if (input.password.length < PASSWORD_MIN) return { ok: false, error: `Kata sandi minimal ${PASSWORD_MIN} karakter.` };
  if (!ROLES.includes(input.role)) return { ok: false, error: "Pilih role akun." };
  if (input.role === "spv" && !input.branchIds.length) return { ok: false, error: "Pilih minimal 1 cabang untuk SPV." };
  if (input.role === "karyawan" && !input.employeeId) return { ok: false, error: "Pilih data karyawan untuk akun karyawan." };

  const authAdmin = createAdminAuthClient();
  const { data, error } = await authAdmin.createUser({ email, password: input.password, email_confirm: true });
  if (error || !data.user) {
    if (error?.code === "email_exists" || error?.code === "user_already_exists") return { ok: false, error: `Username / email ${displayLogin(email)} sudah dipakai.` };
    if (error?.code === "weak_password") return { ok: false, error: "Kata sandi terlalu lemah." };
    return { ok: false, error: "Gagal membuat akun." };
  }

  // Role disimpan lewat client admin yang login (RLS + trigger tetap berlaku).
  const { error: roleError } = await supabase.from("app_user").insert({
    user_id: data.user.id,
    role: input.role,
    branch_id: input.role === "spv" ? input.branchIds[0] : null,
    employee_id: input.role === "karyawan" || input.role === "spv" ? input.employeeId || null : null,
  });
  const branchError = roleError ? null : await syncSpvBranches(supabase, data.user.id, input.role === "spv" ? input.branchIds : []);
  if (roleError || branchError) {
    await authAdmin.deleteUser(data.user.id);
    return { ok: false, error: roleError ? friendly(roleError) : branchError! };
  }

  revalidatePath("/pengaturan/akses");
  return { ok: true, login: displayLogin(email) };
}
