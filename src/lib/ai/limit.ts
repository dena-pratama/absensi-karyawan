import "server-only";
import { createServiceClient, isAdminApiConfigured } from "@/lib/supabase/admin";
import type { AiProvider } from "./providers";

/**
 * Catat / hapus penanda "kena limit" pada konektor (kolom dari migrasi ai_limit_alert).
 * Lewat secret key karena Office juga memakai AI tapi tidak boleh menulis ai_connector.
 * Gagal diam-diam (mis. kolom belum ada): penanda hanya pengingat, bukan bagian alur utama.
 */
export async function setConnectorLimit(provider: AiProvider, message: string | null) {
  if (!isAdminApiConfigured) return;
  try {
    await createServiceClient()
      .from("ai_connector")
      .update({ limited_at: message ? new Date().toISOString() : null, limit_message: message?.slice(0, 500) ?? null })
      .eq("provider", provider);
  } catch {
    // abaikan
  }
}
