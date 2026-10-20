"use server";

import { revalidatePath } from "next/cache";
import type { AppRole } from "@/lib/labels";
import { createAdminAuthClient, isAdminApiConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type AccessChange = {
  userId: string;
  role: AppRole | ""; // "" = cabut akses
  branchId: string;
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
    if (c.role === "spv" && !c.branchId) return { ok: false, error: "Pilih cabang untuk SPV.", applied };
    if (c.role === "karyawan" && !c.employeeId) return { ok: false, error: "Pilih data karyawan untuk akun karyawan.", applied };

    const { error } = c.role
      ? await supabase.from("app_user").upsert(
          {
            user_id: c.userId,
            role: c.role,
            branch_id: c.role === "spv" ? c.branchId : null,
            employee_id: c.role === "karyawan" ? c.employeeId : null,
          },
          { onConflict: "user_id" },
        )
      : await supabase.from("app_user").delete().eq("user_id", c.userId);
    if (error) return { ok: false, error: friendly(error), applied };
    applied++;
  }

  revalidatePath("/pengaturan/akses");
  return { ok: true, applied };
}

export type NewAccount = {
  email: string;
  password: string;
  role: AppRole;
  branchId: string;
  employeeId: string;
};

export type CreateResult = { ok: true; email: string } | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN = 8;

/**
 * Buat akun login baru (Supabase Auth, email sudah terkonfirmasi) + role-nya.
 * Butuh SUPABASE_SECRET_KEY di server. Kalau menyimpan role gagal, akun dihapus lagi.
 */
export async function createUserAccount(input: NewAccount): Promise<CreateResult> {
  if (!isAdminApiConfigured) return { ok: false, error: "SUPABASE_SECRET_KEY belum diatur di server." };

  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (isAdmin !== true) return { ok: false, error: "Hanya admin yang boleh membuat akun." };

  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Format email tidak valid." };
  if (input.password.length < PASSWORD_MIN) return { ok: false, error: `Kata sandi minimal ${PASSWORD_MIN} karakter.` };
  if (!ROLES.includes(input.role)) return { ok: false, error: "Pilih role akun." };
  if (input.role === "spv" && !input.branchId) return { ok: false, error: "Pilih cabang untuk SPV." };
  if (input.role === "karyawan" && !input.employeeId) return { ok: false, error: "Pilih data karyawan untuk akun karyawan." };

  const authAdmin = createAdminAuthClient();
  const { data, error } = await authAdmin.createUser({ email, password: input.password, email_confirm: true });
  if (error || !data.user) {
    if (error?.code === "email_exists" || error?.code === "user_already_exists") return { ok: false, error: `Email ${email} sudah terdaftar.` };
    if (error?.code === "weak_password") return { ok: false, error: "Kata sandi terlalu lemah." };
    return { ok: false, error: "Gagal membuat akun." };
  }

  // Role disimpan lewat client admin yang login (RLS + trigger tetap berlaku).
  const { error: roleError } = await supabase.from("app_user").insert({
    user_id: data.user.id,
    role: input.role,
    branch_id: input.role === "spv" ? input.branchId : null,
    employee_id: input.role === "karyawan" ? input.employeeId : null,
  });
  if (roleError) {
    await authAdmin.deleteUser(data.user.id);
    return { ok: false, error: friendly(roleError) };
  }

  revalidatePath("/pengaturan/akses");
  return { ok: true, email };
}
