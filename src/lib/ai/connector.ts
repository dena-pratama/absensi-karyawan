import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { decryptSecret } from "./crypto";
import type { AiProvider, ConnectorInfo } from "./providers";

type Row = {
  provider: AiProvider;
  model: string;
  api_key_ciphertext: string;
  api_key_last4: string;
  base_url?: string | null; // ada setelah migrasi ai_more_providers
  limited_at?: string | null; // ada setelah migrasi ai_limit_alert
  limit_message?: string | null;
  is_active: boolean;
  updated_at: string;
};

/** Daftar konektor tanpa API key (untuk halaman Pengaturan). */
export async function getConnectors(): Promise<{ connectors: ConnectorInfo[]; tableMissing: boolean }> {
  const supabase = await createClient();
  const query = (cols: string) => supabase.from("ai_connector").select(cols).order("provider");
  // Kolom base_url belum ada sebelum migrasi ai_more_providers → ulang tanpa kolom itu.
  let res = await query("provider, model, api_key_last4, base_url, limited_at, limit_message, is_active, updated_at");
  if (res.error?.code === "42703") res = await query("provider, model, api_key_last4, base_url, is_active, updated_at");
  if (res.error?.code === "42703") res = await query("provider, model, api_key_last4, is_active, updated_at");
  const { error } = res;
  const data = res.data as unknown as Row[] | null;
  if (error) {
    // PGRST205 = tabel belum ada (migrasi ai_connector belum dijalankan)
    if (error.code === "PGRST205") return { connectors: [], tableMissing: true };
    throw new Error(`Gagal memuat konektor AI: ${error.message}`);
  }
  return {
    tableMissing: false,
    connectors: (data ?? []).map((r) => ({
      provider: r.provider as AiProvider,
      model: r.model as string,
      last4: r.api_key_last4 as string,
      baseUrl: r.base_url ?? null,
      limitedAt: r.limited_at ?? null,
      limitMessage: r.limit_message ?? null,
      isActive: r.is_active as boolean,
      updatedAt: r.updated_at as string,
    })),
  };
}

/** Konektor aktif + API key terdekripsi (hanya di server). */
/**
 * service=true: baca lewat secret key, untuk role Office yang memakai Smart AI tapi tidak
 * boleh membaca tabel ai_connector (RLS khusus admin). Key tetap hanya didekripsi di server.
 */
export async function getActiveConnector({ service = false } = {}): Promise<{
  provider: AiProvider;
  model: string;
  apiKey: string;
  baseUrl: string | null;
} | null> {
  const supabase = service ? createServiceClient() : await createClient();
  const query = (cols: string) => supabase.from("ai_connector").select(cols).eq("is_active", true).maybeSingle();
  let res = await query("provider, model, api_key_ciphertext, base_url");
  if (res.error?.code === "42703") res = await query("provider, model, api_key_ciphertext");
  if (res.error || !res.data) return null;
  const row = res.data as unknown as Row;
  return { provider: row.provider, model: row.model, apiKey: decryptSecret(row.api_key_ciphertext), baseUrl: row.base_url ?? null };
}

/** API key tersimpan untuk satu provider (dipakai tes koneksi tanpa mengetik ulang key). */
export async function getStoredKey(provider: AiProvider): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("ai_connector").select("api_key_ciphertext").eq("provider", provider).maybeSingle();
  return data ? decryptSecret(data.api_key_ciphertext as string) : null;
}
