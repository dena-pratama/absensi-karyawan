"use server";

import { saveAttendance } from "@/lib/actions/attendance";
import { getActiveConnector } from "@/lib/ai/connector";
import { isAiKeyConfigured, verifyPayload } from "@/lib/ai/crypto";
import { AiError, runAgent, type ChatTurn } from "@/lib/ai/engine";
import type { AttendanceProposal, SignedProposal } from "@/lib/ai/proposal";
import { AI_TOOLS, createToolExecutor } from "@/lib/ai/tools";
import { AI_PROVIDERS } from "@/lib/ai/providers";
import { getShellData } from "@/lib/data/shell";
import { todayWIB } from "@/lib/format";

export type AskResult =
  | { ok: true; reply: string; proposals: SignedProposal[]; model: string }
  | { ok: false; error: string };

const MAX_TURNS = 20;
const MAX_CHARS = 4000;

function systemPrompt(today: string, branchCode: string | null) {
  return `Kamu adalah "Smart AI Analytics" di aplikasi web Absensi Ekspedisi (hub/cabang/outlet ekspedisi).
Penggunamu adalah admin tunggal yang mengelola ceklis absensi harian karyawan.

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
- Untuk mengisi atau mengubah absensi, gunakan tool usulkan_perubahan_absensi. Perubahan baru tersimpan setelah admin menekan "Setujui" pada kartu usulan. Jangan pernah menyatakan data sudah tersimpan atau sudah diubah.
- Jika permintaan ambigu untuk perubahan data (tanggal, cabang, atau karyawan tidak jelas), tanyakan dulu sebelum membuat usulan.
- Di luar topik absensi & data aplikasi ini, jawab singkat dan arahkan kembali ke analisis absensi.`;
}

export async function askAssistant(history: ChatTurn[], message: string): Promise<AskResult> {
  const text = message.trim().slice(0, MAX_CHARS);
  if (!text) return { ok: false, error: "Pertanyaan kosong." };
  if (!isAiKeyConfigured()) return { ok: false, error: "AI_ENCRYPTION_KEY belum diatur di server." };

  const connector = await getActiveConnector().catch(() => null);
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
  const { execute, proposals } = createToolExecutor(today);

  try {
    const reply = await runAgent({
      provider: connector.provider,
      model: connector.model,
      apiKey: connector.apiKey,
      system: systemPrompt(today, activeBranch?.code ?? null),
      history: [...cleanHistory, { role: "user", text }],
      tools: AI_TOOLS,
      execute,
    });
    return {
      ok: true,
      reply: reply || "(AI tidak memberikan jawaban teks.)",
      proposals,
      model: `${AI_PROVIDERS[connector.provider].label} · ${connector.model}`,
    };
  } catch (err) {
    return { ok: false, error: err instanceof AiError ? err.message : "Terjadi kesalahan saat memproses pertanyaan." };
  }
}

export type ApproveResult = { ok: true; saved: number } | { ok: false; error: string };

/** Jalankan usulan AI setelah admin menekan "Setujui". Token diverifikasi HMAC + masa berlaku. */
export async function approveProposal(token: string): Promise<ApproveResult> {
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
