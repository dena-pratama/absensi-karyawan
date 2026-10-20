import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/labels";

/** PostgREST: fungsi / tabel belum ada (migrasi role_based_rls belum dijalankan). */
const MISSING = new Set(["PGRST202", "PGRST205", "42883"]);

export type UserAccess = {
  userId: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
  role: AppRole | null; // null = belum diberi akses
  branchId: string;
  employeeId: string;
};

/** Daftar akun login + role (khusus admin). rlsReady=false bila migrasi belum dijalankan. */
export async function getUserAccessList(): Promise<{ users: UserAccess[]; rlsReady: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_users");
  if (error) {
    if (MISSING.has(error.code)) return { users: [], rlsReady: false };
    throw new Error(`Gagal memuat daftar pengguna: ${error.message}`);
  }
  type Row = {
    user_id: string;
    email: string | null;
    created_at: string;
    last_sign_in_at: string | null;
    role: AppRole | null;
    branch_id: string | null;
    employee_id: string | null;
  };
  return {
    rlsReady: true,
    users: ((data ?? []) as Row[]).map((r) => ({
      userId: r.user_id,
      email: r.email ?? "(tanpa email)",
      createdAt: r.created_at,
      lastSignInAt: r.last_sign_in_at,
      role: r.role,
      branchId: r.branch_id ?? "",
      employeeId: r.employee_id ?? "",
    })),
  };
}

/** Pesan untuk SPV / karyawan yang mencoba mengubah data dari panel web. */
export const READ_ONLY_ERROR = "Akun ini hanya bisa melihat data di web. Perubahan hanya oleh admin.";

/** Penjaga server action: panel web hanya-lihat untuk selain admin. */
export async function isAdmin(): Promise<boolean> {
  return (await getMyAccess()).role === "admin";
}

/**
 * Role akun yang sedang login. Sebelum migrasi RLS dijalankan semua akun
 * masih berakses penuh, jadi dianggap admin (rlsReady=false).
 */
export const getMyAccess = cache(async (): Promise<{ role: AppRole | null; rlsReady: boolean }> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("current_app_role");
  if (error) {
    if (MISSING.has(error.code)) return { role: "admin", rlsReady: false };
    throw new Error(`Gagal memuat hak akses: ${error.message}`);
  }
  return { role: (data as AppRole | null) ?? null, rlsReady: true };
});
