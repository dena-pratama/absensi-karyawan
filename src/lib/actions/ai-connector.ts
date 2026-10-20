"use server";

import { revalidatePath } from "next/cache";
import { getStoredKey } from "@/lib/ai/connector";
import { encryptSecret, isAiKeyConfigured } from "@/lib/ai/crypto";
import { AiError, listModels } from "@/lib/ai/engine";
import { isAiProvider, type AiProvider } from "@/lib/ai/providers";
import { READ_ONLY_ERROR, isAdmin } from "@/lib/data/access";
import { createClient } from "@/lib/supabase/server";

export type ConnectorResult = { ok: true; message: string } | { ok: false; error: string };
export type TestResult = { ok: true; models: string[] } | { ok: false; error: string };

const MODEL_RE = /^[A-Za-z0-9._:\-/]{2,100}$/;

async function resolveKey(provider: AiProvider, apiKey: string) {
  return apiKey.trim() || (await getStoredKey(provider).catch(() => null)) || "";
}

/** Tes API key (yang diketik, atau yang tersimpan) dengan mengambil daftar model. */
export async function testConnector(provider: string, apiKey: string): Promise<TestResult> {
  if (!(await isAdmin())) return { ok: false, error: READ_ONLY_ERROR };
  if (!isAiProvider(provider)) return { ok: false, error: "Provider tidak valid." };
  if (!isAiKeyConfigured()) return { ok: false, error: "AI_ENCRYPTION_KEY belum diatur di server." };
  const key = await resolveKey(provider, apiKey);
  if (!key) return { ok: false, error: "Isi API key terlebih dahulu." };
  try {
    return { ok: true, models: await listModels(provider, key) };
  } catch (err) {
    return { ok: false, error: err instanceof AiError ? err.message : "Gagal tes koneksi." };
  }
}

/**
 * Simpan konektor. API key kosong = pakai key tersimpan (tidak diubah).
 * activate = jadikan konektor aktif (yang lain otomatis nonaktif).
 */
export async function saveConnector(input: {
  provider: string;
  model: string;
  apiKey: string;
  activate: boolean;
}): Promise<ConnectorResult> {
  if (!(await isAdmin())) return { ok: false, error: READ_ONLY_ERROR };
  const { provider, activate } = input;
  const model = input.model.trim();
  if (!isAiProvider(provider)) return { ok: false, error: "Provider tidak valid." };
  if (!MODEL_RE.test(model)) return { ok: false, error: "Nama model tidak valid." };
  if (!isAiKeyConfigured()) return { ok: false, error: "AI_ENCRYPTION_KEY belum diatur di server." };

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub ?? null;

  const newKey = input.apiKey.trim();
  const { data: existing } = await supabase.from("ai_connector").select("id").eq("provider", provider).maybeSingle();
  if (!existing && !newKey) return { ok: false, error: "API key wajib diisi untuk konektor baru." };

  if (activate) {
    const { error } = await supabase.from("ai_connector").update({ is_active: false }).neq("provider", provider);
    if (error) return { ok: false, error: "Gagal menonaktifkan konektor lain." };
  }

  const cols = {
    provider,
    model,
    is_active: activate,
    updated_by: userId,
    ...(newKey ? { api_key_ciphertext: encryptSecret(newKey), api_key_last4: newKey.slice(-4) } : {}),
  };
  const { error } = existing
    ? await supabase.from("ai_connector").update(cols).eq("id", existing.id)
    : await supabase.from("ai_connector").insert(cols);
  if (error) {
    return {
      ok: false,
      error: error.code === "PGRST205" ? "Tabel ai_connector belum ada. Jalankan migrasi 20261020010000_ai_connector.sql." : "Gagal menyimpan konektor.",
    };
  }

  revalidatePath("/pengaturan/ai");
  return { ok: true, message: activate ? "Konektor disimpan dan diaktifkan." : "Konektor disimpan." };
}

export async function deactivateConnector(provider: string): Promise<ConnectorResult> {
  if (!(await isAdmin())) return { ok: false, error: READ_ONLY_ERROR };
  if (!isAiProvider(provider)) return { ok: false, error: "Provider tidak valid." };
  const supabase = await createClient();
  const { error } = await supabase.from("ai_connector").update({ is_active: false }).eq("provider", provider);
  if (error) return { ok: false, error: "Gagal menonaktifkan konektor." };
  revalidatePath("/pengaturan/ai");
  return { ok: true, message: "Konektor dinonaktifkan." };
}

export async function deleteConnector(provider: string): Promise<ConnectorResult> {
  if (!(await isAdmin())) return { ok: false, error: READ_ONLY_ERROR };
  if (!isAiProvider(provider)) return { ok: false, error: "Provider tidak valid." };
  const supabase = await createClient();
  const { error } = await supabase.from("ai_connector").delete().eq("provider", provider);
  if (error) return { ok: false, error: "Gagal menghapus konektor." };
  revalidatePath("/pengaturan/ai");
  return { ok: true, message: "Konektor & API key dihapus." };
}
