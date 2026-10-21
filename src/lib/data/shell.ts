import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { initials } from "@/lib/format";
import { displayLogin } from "@/lib/login-id";
import type { BranchType } from "@/lib/labels";

export const ACTIVE_BRANCH_COOKIE = "active_branch";

export type BranchSummary = {
  id: string;
  code: string;
  name: string;
  branch_type: BranchType;
  status: "aktif" | "maintenance" | "nonaktif";
};

export type ShellData = {
  user: { name: string; email: string; initials: string };
  branches: BranchSummary[];
  activeBranch: BranchSummary | null;
};

/**
 * Data bersama untuk topbar & halaman: admin yang login, daftar cabang,
 * dan cabang aktif (disimpan di cookie, default cabang pertama).
 * Dibungkus cache() supaya cukup sekali query per request.
 */
export const getShellData = cache(async (): Promise<ShellData> => {
  const supabase = await createClient();
  const [{ data: auth }, { data: branches, error }] = await Promise.all([
    supabase.auth.getClaims(),
    supabase
      .from("branch")
      .select("id, code, name, branch_type, status")
      .neq("status", "nonaktif")
      .order("code"),
  ]);
  if (error) throw new Error(`Gagal memuat cabang: ${error.message}`);

  const list = (branches ?? []) as BranchSummary[];
  const savedId = (await cookies()).get(ACTIVE_BRANCH_COOKIE)?.value;
  const activeBranch = list.find((b) => b.id === savedId) ?? list[0] ?? null;

  const claims = auth?.claims;
  // Akun username → tampilkan username, bukan email internal.
  const email = displayLogin(String(claims?.email ?? ""));
  const meta = (claims?.user_metadata ?? {}) as Record<string, unknown>;
  const fallback = email.split("@")[0] ?? "Admin";
  const name = String(meta.full_name ?? meta.name ?? fallback.charAt(0).toUpperCase() + fallback.slice(1));

  return {
    user: { name, email, initials: initials(name) },
    branches: list,
    activeBranch,
  };
});
