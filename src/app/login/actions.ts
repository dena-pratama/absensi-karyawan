"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { toLoginEmail } from "@/lib/login-id";
import { REMEMBER_COOKIE, isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/** login = isian username atau email (dikembalikan supaya tidak perlu diketik ulang saat gagal). */
export type LoginState = { error: string | null; login: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const identifier = String(formData.get("login") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const remember = formData.get("remember") === "on";

  if (!identifier || !password) {
    return { error: "Username / email dan kata sandi wajib diisi.", login: identifier };
  }
  if (!isSupabaseConfigured) {
    return { error: "Server belum terhubung ke Supabase. Hubungi pengelola sistem.", login: identifier };
  }
  const email = toLoginEmail(identifier);
  if (!email) return { error: "Username / email atau kata sandi salah.", login: identifier };

  // Set sebelum sign-in agar cookie auth langsung mengikuti pilihan ini.
  const cookieStore = await cookies();
  cookieStore.set(REMEMBER_COOKIE, remember ? "1" : "0", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(remember ? { maxAge: 60 * 60 * 24 * 400 } : {}),
  });

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const message =
      error.code === "invalid_credentials"
        ? "Username / email atau kata sandi salah."
        : "Gagal masuk. Coba lagi beberapa saat.";
    return { error: message, login: identifier };
  }

  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
