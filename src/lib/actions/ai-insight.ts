"use server";

import { getActiveConnector } from "@/lib/ai/connector";
import { isAiKeyConfigured } from "@/lib/ai/crypto";
import { AiError, runAgent } from "@/lib/ai/engine";
import { setConnectorLimit } from "@/lib/ai/limit";
import { AI_PROVIDERS } from "@/lib/ai/providers";
import { AI_TOOLS, createToolExecutor } from "@/lib/ai/tools";
import { getMyAccess } from "@/lib/data/access";
import { getShellData } from "@/lib/data/shell";
import { todayWIB } from "@/lib/format";
import { createServiceClient, isAdminApiConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type InsightResult =
  | { ok: true; content: string; model: string; createdAt: string; cached: boolean }
  | { ok: false; error: string; limit?: boolean; canManage?: boolean };

/** Tool yang boleh dipakai insight: baca saja, tanpa usulan perubahan. */
const READ_TOOLS = AI_TOOLS.filter((t) => t.name !== "usulkan_perubahan_absensi");
const MAX_CHARS = 8000;

function prompt(today: string, code: string) {
  return `Kamu adalah "AI Insight" di dashboard aplikasi Absensi Ekspedisi. Hari ini ${today} (WIB).
Tugas: buat ringkasan insight kehadiran untuk cabang ${code}, berdasarkan data asli dari tool (jangan mengarang).
Ambil data hari ini dan 7 hari terakhir cabang ini. Status hanya Hadir, Sakit, Tidak Hadir; "belum diabsen" = belum diisi.
Format markdown, Bahasa Indonesia, MAKSIMAL 6 poin singkat:
- 1 poin kondisi hari ini (angka **tebal**),
- tren 7 hari & perbandingan,
- karyawan / pola yang perlu perhatian (sebut nama bila jelas),
- 1 saran tindakan.
Tanpa judul, tanpa pembuka/penutup basa-basi. Jangan pakai tanda pisah panjang.`;
}

/**
 * Insight cabang aktif untuk hari ini. Pakai cache (ai_insight) bila ada; force = buat ulang.
 * Hanya admin & Office. Cache dibaca/ditulis lewat secret key setelah cek role.
 */
export async function getBranchInsight(force = false): Promise<InsightResult> {
  const { role } = await getMyAccess();
  if (role !== "admin" && role !== "office") return { ok: false, error: "AI Insight hanya untuk admin dan Office." };
  if (!isAdminApiConfigured) return { ok: false, error: "SUPABASE_SECRET_KEY belum diatur di server." };

  const { activeBranch } = await getShellData();
  if (!activeBranch) return { ok: false, error: "Belum ada cabang." };
  const today = todayWIB();
  const db = createServiceClient();

  if (!force) {
    const { data, error } = await db
      .from("ai_insight")
      .select("content, model, created_at")
      .eq("branch_id", activeBranch.id)
      .eq("insight_date", today)
      .maybeSingle();
    if (error?.code === "PGRST205" || error?.code === "42P01") {
      return { ok: false, error: "Jalankan migrasi 20261028000000_ai_insight.sql di Supabase." };
    }
    if (data) return { ok: true, content: data.content as string, model: data.model as string, createdAt: data.created_at as string, cached: true };
  }

  if (!isAiKeyConfigured()) return { ok: false, error: "AI_ENCRYPTION_KEY belum diatur di server." };
  const connector = await getActiveConnector({ service: true }).catch(() => null);
  if (!connector) return { ok: false, error: "Konektor AI belum aktif. Atur di Pengaturan > Konektor AI." };

  try {
    const { execute } = createToolExecutor(today); // data dibaca lewat RLS akun yang login
    const reply = await runAgent({
      provider: connector.provider,
      model: connector.model,
      apiKey: connector.apiKey,
      baseUrl: connector.baseUrl,
      system: prompt(today, activeBranch.code),
      history: [{ role: "user", text: `Buat insight kehadiran cabang ${activeBranch.code} hari ini.` }],
      tools: READ_TOOLS,
      execute,
    });
    const content = reply.replace(/—/g, "-").slice(0, MAX_CHARS).trim();
    if (!content) return { ok: false, error: "AI tidak memberikan insight. Coba Perbarui." };
    void setConnectorLimit(connector.provider, null);

    const model = `${AI_PROVIDERS[connector.provider].label} · ${connector.model}`;
    const { data: auth } = await (await createClient()).auth.getClaims();
    const createdAt = new Date().toISOString();
    const { error } = await db.from("ai_insight").upsert({
      branch_id: activeBranch.id,
      insight_date: today,
      content,
      model,
      generated_by: auth?.claims?.sub ?? null,
      created_at: createdAt,
    });
    if (error?.code === "PGRST205" || error?.code === "42P01") {
      return { ok: false, error: "Jalankan migrasi 20261028000000_ai_insight.sql di Supabase." };
    }
    return { ok: true, content, model, createdAt, cached: false };
  } catch (err) {
    if (err instanceof AiError && err.limit) {
      await setConnectorLimit(connector.provider, err.message);
      return { ok: false, error: err.message, limit: true, canManage: role === "admin" };
    }
    return { ok: false, error: err instanceof AiError ? err.message : "Gagal membuat insight." };
  }
}
