import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { REMEMBER_COOKIE, SUPABASE_KEY, SUPABASE_URL, withRememberPolicy } from "./config";

/** Supabase client untuk Server Component, Server Action, dan Route Handler. */
export async function createClient() {
  // cookies() + connection() dipanggil duluan supaya query Supabase hanya jalan
  // saat request sungguhan. Dengan Partial Prefetching, data sesi (cookies) ikut
  // di-prerender ke App Shell, padahal auth Supabase memakai Date.now().
  const cookieStore = await cookies();
  await connection();

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error(
      "Supabase belum dikonfigurasi. Isi NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY di .env.local",
    );
  }

  const remember = cookieStore.get(REMEMBER_COOKIE)?.value !== "0";

  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, withRememberPolicy(value, options, remember)),
          );
        } catch {
          // Dipanggil dari Server Component (cookie read-only).
          // Aman diabaikan karena proxy yang me-refresh sesi.
        }
      },
    },
  });
}
