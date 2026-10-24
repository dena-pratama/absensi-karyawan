import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./config";

/**
 * Secret key Supabase (sb_secret_… / legacy service_role). OPSIONAL — hanya untuk
 * membuat akun login dari Pengaturan → Pengguna & Akses. Melewati RLS, jadi:
 * hanya dibaca di server (modul server-only), tanpa awalan NEXT_PUBLIC_, dan
 * hanya dipakai setelah pemanggil dicek sebagai admin.
 */
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

export const isAdminApiConfigured = Boolean(SUPABASE_URL && SECRET_KEY);

/**
 * Client database dengan secret key (melewati RLS). Hanya untuk membaca data yang memang
 * dijaga di server, mis. konektor AI aktif untuk Smart AI role Office. Jangan dipakai untuk
 * data yang bisa dibaca lewat client user biasa.
 */
export function createServiceClient() {
  if (!SUPABASE_URL || !SECRET_KEY) throw new Error("SUPABASE_SECRET_KEY belum diatur di server.");
  return createClient(SUPABASE_URL, SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** Client Auth Admin (tanpa sesi / cookie). Panggil hanya dari server action yang sudah cek admin. */
export function createAdminAuthClient() {
  if (!SUPABASE_URL || !SECRET_KEY) throw new Error("SUPABASE_SECRET_KEY belum diatur di server.");
  return createClient(SUPABASE_URL, SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }).auth.admin;
}
