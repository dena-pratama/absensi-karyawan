import "server-only";
import { createClient } from "@/lib/supabase/server";
import { decryptSecret } from "./crypto";
import type { AiProvider, ConnectorInfo } from "./providers";

type Row = {
  provider: AiProvider;
  model: string;
  api_key_ciphertext: string;
  api_key_last4: string;
  is_active: boolean;
  updated_at: string;
};

/** Daftar konektor tanpa API key (untuk halaman Pengaturan). */
export async function getConnectors(): Promise<{ connectors: ConnectorInfo[]; tableMissing: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_connector")
    .select("provider, model, api_key_last4, is_active, updated_at")
    .order("provider");
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
      isActive: r.is_active as boolean,
      updatedAt: r.updated_at as string,
    })),
  };
}

/** Konektor aktif + API key terdekripsi (hanya di server). */
export async function getActiveConnector(): Promise<{ provider: AiProvider; model: string; apiKey: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_connector")
    .select("provider, model, api_key_ciphertext, api_key_last4, is_active, updated_at")
    .eq("is_active", true)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Row;
  return { provider: row.provider, model: row.model, apiKey: decryptSecret(row.api_key_ciphertext) };
}

/** API key tersimpan untuk satu provider (dipakai tes koneksi tanpa mengetik ulang key). */
export async function getStoredKey(provider: AiProvider): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("ai_connector").select("api_key_ciphertext").eq("provider", provider).maybeSingle();
  return data ? decryptSecret(data.api_key_ciphertext as string) : null;
}
