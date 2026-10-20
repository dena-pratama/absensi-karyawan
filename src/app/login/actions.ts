"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { REMEMBER_COOKIE, isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error: string | null; email: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const remember = formData.get("remember") === "on";

  if (!email || !password) {
    return { error: "Email dan kata sandi wajib diisi.", email };
  }
  if (!isSupabaseConfigured) {
    return { error: "Server belum terhubung ke Supabase. Hubungi pengelola sistem.", email };
  }

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
        ? "Email atau kata sandi salah."
        : "Gagal masuk. Coba lagi beberapa saat.";
    return { error: message, email };
  }

  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
