import type { CookieOptions } from "@supabase/ssr";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

/** Cookie penanda pilihan "Ingat sesi perangkat" di halaman login. */
export const REMEMBER_COOKIE = "remember_session";

/**
 * Kalau admin tidak mencentang "Ingat sesi perangkat", cookie auth dijadikan
 * session cookie (hilang saat browser ditutup). Cookie penghapusan
 * (value kosong / maxAge 0) dibiarkan apa adanya.
 */
export function withRememberPolicy(
  value: string,
  options: CookieOptions,
  remember: boolean,
): CookieOptions {
  if (remember || !value || options.maxAge === 0) return options;
  return { ...options, maxAge: undefined, expires: undefined };
}
