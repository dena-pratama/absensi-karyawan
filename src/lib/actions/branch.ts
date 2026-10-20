"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACTIVE_BRANCH_COOKIE } from "@/lib/data/shell";

/** Ganti cabang aktif (dipakai oleh pilihan cabang di topbar). */
export async function setActiveBranch(branchId: string) {
  (await cookies()).set(ACTIVE_BRANCH_COOKIE, branchId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

/** Tombol "Lihat Detail" di kartu cabang Dashboard: jadikan cabang aktif lalu buka Daftar Karyawan-nya. */
export async function openBranchEmployees(branchId: string) {
  await setActiveBranch(branchId);
  redirect("/absensi/karyawan");
}
