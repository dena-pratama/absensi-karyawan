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
    // Akun sendiri: role tetap admin, hanya hubungan ke data karyawan (untuk kasbon) yang boleh diubah.
    if (c.userId === me && c.role !== "admin") return { ok: false, error: "Hak akses akun sendiri tidak bisa diubah.", applied };
    if (c.role && !ROLES.includes(c.role)) return { ok: false, error: "Role tidak valid.", applied };
    if (c.role === "spv" && !c.branchIds.length) return { ok: false, error: "Pilih minimal 1 cabang untuk SPV.", applied };
    if (c.role === "karyawan" && !c.employeeId) return { ok: false, error: "Pilih data karyawan untuk akun karyawan.", applied };

    const { error } = c.role
      ? await supabase.from("app_user").upsert(
          {
            user_id: c.userId,
            role: c.role,
            branch_id: c.role === "spv" ? c.branchIds[0] : null,
            employee_id: c.employeeId || null, // admin & SPV opsional (kasbon / absen), karyawan wajib
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
    employee_id: input.employeeId || null,
  });
  const branchError = roleError ? null : await syncSpvBranches(supabase, data.user.id, input.role === "spv" ? input.branchIds : []);
  if (roleError || branchError) {
    await authAdmin.deleteUser(data.user.id);
    return { ok: false, error: roleError ? friendly(roleError) : branchError! };
  }

  revalidatePath("/pengaturan/akses");
  return { ok: true, login: displayLogin(email) };
}

export type AccountResult = { ok: true; message: string } | { ok: false; error: string };

/** Cek admin + Admin API untuk aksi akun (ubah login / kata sandi, hapus). */
async function adminContext() {
  if (!isAdminApiConfigured) return { error: "SUPABASE_SECRET_KEY belum diatur di server." } as const;
  const supabase = await createClient();
  const [{ data: isAdmin }, { data: auth }] = await Promise.all([supabase.rpc("is_admin"), supabase.auth.getClaims()]);
  if (isAdmin !== true) return { error: "Hanya admin yang boleh mengubah akun." } as const;
  return { supabase, me: auth?.claims?.sub ?? null, authAdmin: createAdminAuthClient() } as const;
}

/**
 * Ubah username / email dan/atau kata sandi akun. Isian kosong = tidak diubah.
 * Kata sandi baru langsung berlaku; sesi yang sedang login di perangkat lain tetap jalan sampai token habis.
 */
export async function updateUserAccount(input: { userId: string; login: string; password: string }): Promise<AccountResult> {
  const ctx = await adminContext();
  if ("error" in ctx) return { ok: false, error: ctx.error! };

  const login = input.login.trim();
  const email = login ? toLoginEmail(login) : null;
  if (login && !email) return { ok: false, error: `Username tidak valid. ${USERNAME_HINT}` };
  if (input.password && input.password.length < PASSWORD_MIN) return { ok: false, error: `Kata sandi minimal ${PASSWORD_MIN} karakter.` };

  const { data: current, error: getError } = await ctx.authAdmin.getUserById(input.userId);
  if (getError || !current.user) return { ok: false, error: "Akun tidak ditemukan." };

  const changes: { email?: string; email_confirm?: boolean; password?: string } = {};
  if (email && email !== current.user.email) Object.assign(changes, { email, email_confirm: true });
  if (input.password) changes.password = input.password;
  if (!Object.keys(changes).length) return { ok: true, message: "Tidak ada perubahan." };

  const { error } = await ctx.authAdmin.updateUserById(input.userId, changes);
  if (error) {
    if (error.code === "email_exists" || error.code === "user_already_exists") return { ok: false, error: `Username / email ${displayLogin(email!)} sudah dipakai.` };
    if (error.code === "weak_password" || error.code === "same_password") return { ok: false, error: "Kata sandi ditolak. Coba kata sandi lain." };
    return { ok: false, error: "Gagal mengubah akun." };
  }

  revalidatePath("/pengaturan/akses");
  const what = [changes.email && "username", changes.password && "kata sandi"].filter(Boolean).join(" & ");
  return { ok: true, message: `Akun ${displayLogin(email ?? current.user.email ?? "")} diperbarui (${what}).` };
}

/**
 * Hapus akun login permanen. Role dihapus dulu lewat client admin yang login (trigger
 * "minimal satu admin" tetap menjaga), baru akun Auth-nya. Data karyawan & absensi tidak ikut terhapus.
 */
export async function deleteUserAccount(userId: string): Promise<AccountResult> {
  const ctx = await adminContext();
  if ("error" in ctx) return { ok: false, error: ctx.error! };
  if (userId === ctx.me) return { ok: false, error: "Akun sendiri tidak bisa dihapus." };

  const { error: roleError } = await ctx.supabase.from("app_user").delete().eq("user_id", userId);
  if (roleError) return { ok: false, error: friendly(roleError) };

  const { error } = await ctx.authAdmin.deleteUser(userId);
  if (error) return { ok: false, error: "Role sudah dicabut, tapi akun gagal dihapus. Coba lagi." };

  revalidatePath("/pengaturan/akses");
  return { ok: true, message: "Akun dihapus." };
}
