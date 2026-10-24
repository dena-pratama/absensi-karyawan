"use server";

import { saveAttendance } from "@/lib/actions/attendance";
import { getActiveConnector } from "@/lib/ai/connector";
import { isAiKeyConfigured, verifyPayload } from "@/lib/ai/crypto";
import { AiError, runAgent, type ChatTurn } from "@/lib/ai/engine";
import { setConnectorLimit } from "@/lib/ai/limit";
import type { AttendanceProposal, SignedProposal } from "@/lib/ai/proposal";
import { AI_TOOLS, createToolExecutor } from "@/lib/ai/tools";
import { AI_PROVIDERS } from "@/lib/ai/providers";
import { READ_ONLY_ERROR, getMyAccess, isAdmin } from "@/lib/data/access";
import { getShellData } from "@/lib/data/shell";
import { todayWIB } from "@/lib/format";

export type AskResult =
  | { ok: true; reply: string; proposals: SignedProposal[]; model: string }
  | { ok: false; error: string; limit?: boolean; canManage?: boolean };

const MAX_TURNS = 20;
const MAX_CHARS = 4000;

/** Role yang boleh memakai Smart AI. Office hanya analisis (tanpa usulan perubahan data). */
const AI_ROLES = new Set(["admin", "office"]);
const PROPOSAL_TOOL = "usulkan_perubahan_absensi";

function systemPrompt(today: string, branchCode: string | null, readOnly: boolean) {
  return `Kamu adalah "Smart AI Analytics" di aplikasi web Absensi Ekspedisi (hub/cabang/outlet ekspedisi).
${readOnly
  ? "Penggunamu adalah staf Office (hanya-lihat). Kamu hanya menganalisis data; kamu TIDAK bisa membuat usulan perubahan absensi. Jika diminta mengubah data, jelaskan bahwa perubahan dilakukan admin."
  : "Penggunamu adalah admin yang mengelola ceklis absensi harian karyawan."}

Fakta aplikasi:
- Hari ini: ${today} (zona waktu WIB).
- Cabang yang sedang dipilih admin di layar: ${branchCode ?? "belum ada cabang"}.
- Status absensi hanya tiga: Hadir, Sakit, Tidak Hadir. Tidak ada shift, jam masuk, atau keterlambatan.
- % hadir = jumlah Hadir dibagi jumlah hari yang sudah diisi. "Belum diabsen" berarti belum diisi admin.

Cara kerja:
- Selalu ambil angka lewat tool yang tersedia. Jangan mengarang data. Jika data kosong, katakan apa adanya.
- Untuk pertanyaan relatif ("bulan ini", "minggu lalu", "kemarin"), hitung tanggalnya dari tanggal hari ini.
- Jawab dalam Bahasa Indonesia yang ringkas dan jelas. Gunakan markdown: poin-poin, **tebal** untuk angka penting, dan tabel untuk perbandingan.
- Beri insight singkat bila relevan (tren, karyawan/cabang yang perlu perhatian), tetapi bedakan fakta dari dugaan.
${readOnly ? "" : "- Untuk mengisi atau mengubah absensi, gunakan tool usulkan_perubahan_absensi."} Perubahan baru tersimpan setelah admin menekan "Setujui" pada kartu usulan. Jangan pernah menyatakan data sudah tersimpan atau sudah diubah.
- Jika permintaan ambigu untuk perubahan data (tanggal, cabang, atau karyawan tidak jelas), tanyakan dulu sebelum membuat usulan.
- Di luar topik absensi & data aplikasi ini, jawab singkat dan arahkan kembali ke analisis absensi.`;
}

export async function askAssistant(history: ChatTurn[], message: string): Promise<AskResult> {
  const { role } = await getMyAccess();
  if (!role || !AI_ROLES.has(role)) return { ok: false, error: "Smart AI hanya untuk admin dan Office." };
  const readOnly = role !== "admin";
  const text = message.trim().slice(0, MAX_CHARS);
  if (!text) return { ok: false, error: "Pertanyaan kosong." };
  if (!isAiKeyConfigured()) return { ok: false, error: "AI_ENCRYPTION_KEY belum diatur di server." };

  const connector = await getActiveConnector({ service: readOnly }).catch(() => null);
  if (!connector) {
    return { ok: false, error: "Konektor AI belum aktif. Atur di Pengaturan > Konektor AI." };
  }

  const cleanHistory: ChatTurn[] = history
    .filter((h) => (h.role === "user" || h.role === "assistant") && typeof h.text === "string" && h.text.trim())
    .slice(-MAX_TURNS)
    .map((h) => ({ role: h.role, text: h.text.slice(0, MAX_CHARS * 2) }));
  // Riwayat harus diawali pesan user.
  while (cleanHistory[0]?.role === "assistant") cleanHistory.shift();

  const { activeBranch } = await getShellData();
  const today = todayWIB();
  const tools = createToolExecutor(today);
  // Office: tool usulan dihapus dari daftar dan ditolak bila tetap dipanggil.
  const execute: typeof tools.execute = (name, args) =>
    readOnly && name === PROPOSAL_TOOL ? Promise.resolve("Error: akun Office tidak bisa mengusulkan perubahan data.") : tools.execute(name, args);
  const { proposals } = tools;

  try {
    const reply = await runAgent({
      provider: connector.provider,
      model: connector.model,
      apiKey: connector.apiKey,
      baseUrl: connector.baseUrl,
      system: systemPrompt(today, activeBranch?.code ?? null, readOnly),
      history: [...cleanHistory, { role: "user", text }],
      tools: readOnly ? AI_TOOLS.filter((t) => t.name !== PROPOSAL_TOOL) : AI_TOOLS,
      execute,
    });
    void setConnectorLimit(connector.provider, null);
    return {
      ok: true,
      reply: reply || "(AI tidak memberikan jawaban teks.)",
      proposals,
      model: `${AI_PROVIDERS[connector.provider].label} · ${connector.model}`,
    };
  } catch (err) {
    if (err instanceof AiError && err.limit) {
      await setConnectorLimit(connector.provider, err.message);
      return { ok: false, error: err.message, limit: true, canManage: !readOnly };
    }
    return { ok: false, error: err instanceof AiError ? err.message : "Terjadi kesalahan saat memproses pertanyaan." };
  }
}

export type ApproveResult = { ok: true; saved: number } | { ok: false; error: string };

/** Jalankan usulan AI setelah admin menekan "Setujui". Token diverifikasi HMAC + masa berlaku. */
export async function approveProposal(token: string): Promise<ApproveResult> {
  if (!(await isAdmin())) return { ok: false, error: READ_ONLY_ERROR };
  const proposal = verifyPayload<AttendanceProposal>(token);
  if (!proposal) return { ok: false, error: "Usulan tidak valid atau sudah diubah." };
  if (Date.now() > proposal.expiresAt) return { ok: false, error: "Usulan sudah kedaluwarsa (30 menit). Minta AI membuat usulan baru." };

  const res = await saveAttendance(
    proposal.branchId,
    proposal.date,
    proposal.changes.map((c) => ({ employeeId: c.employeeId, status: c.status, note: c.note })),
  );
  return res.ok ? { ok: true, saved: res.saved } : { ok: false, error: res.error };
}
