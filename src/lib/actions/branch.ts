"use server";

import { cookies } from "next/headers";
import { ACTIVE_BRANCH_COOKIE } from "@/lib/data/shell";

/** Ganti cabang aktif (dipakai oleh pilihan cabang di topbar & tombol "Lihat Detail"). */
export async function setActiveBranch(branchId: string) {
  (await cookies()).set(ACTIVE_BRANCH_COOKIE, branchId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
