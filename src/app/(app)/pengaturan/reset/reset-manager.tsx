"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { resetData, type ResetMode, type ResetResult } from "@/lib/actions/reset";
import { RESET_PHRASE } from "@/lib/labels";
import { Modal, inputCls } from "../_components/ui";

const MODES: { id: ResetMode; title: string; desc: string; removes: string[]; keeps: string[] }[] = [
  {
    id: "transaksi",
    title: "Reset Transaksi",
    desc: "Mulai periode baru. Data master tetap.",
    removes: ["Absensi harian, check in/out & foto selfie", "Kasbon & bukti pencairan", "Penugasan backup karyawan", "AI Insight & log perubahan"],
    keeps: ["Karyawan, cabang, jabatan, gaji", "Semua akun login & role", "Konektor AI & pengaturan"],
  },
  {
    id: "total",
    title: "Reset Total (pabrik)",
    desc: "Mulai dari nol. Hanya akun Anda yang tersisa.",
    removes: ["Semua yang dihapus Reset Transaksi", "Karyawan, penempatan, cabang, cluster, jabatan", "Gaji pokok & pengaturan gajian (kembali default)", "Semua akun login selain akun Anda"],
    keeps: ["Akun admin Anda (tetap admin)", "Konektor AI"],
  },
];

const COUNT_LABEL: Record<string, string> = {
  absensi: "absensi",
  kasbon: "kasbon",
  backup: "penugasan backup",
  karyawan: "karyawan",
  cabang: "cabang",
  jabatan: "jabatan",
  akun: "role akun",
};

export function ResetManager({ adminApiReady }: { adminApiReady: boolean }) {
  const router = useRouter();
  const [backedUpAt, setBackedUpAt] = useState<string | null>(null);
  const [mode, setMode] = useState<ResetMode | null>(null);
  const [step, setStep] = useState<0 | 1 | 2>(0); // 1 = konfirmasi pertama, 2 = ketik kalimat
  const [agree, setAgree] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Extract<ResetResult, { ok: true }> | null>(null);
  const [busy, start] = useTransition();

  const chosen = MODES.find((m) => m.id === mode);
  const close = () => (setStep(0), setAgree(false), setPhrase(""), setError(null));

  const run = () =>
    start(async () => {
      if (!mode) return;
      if (phrase !== RESET_PHRASE) return setError(`Ketik ${RESET_PHRASE} persis (huruf besar).`);
      const res = await resetData(mode, phrase);
      if (!res.ok) return setError(res.error);
      close();
      setResult(res);
      setBackedUpAt(null);
      router.refresh();
    });

  return (
    <>
      <div role="alert" className="rounded-2xl border border-rose-500/50 bg-rose-950/30 p-4 text-xs text-rose-100 flex gap-3">
        <Icon name="warning" className="text-[22px] text-rose-400 flex-shrink-0" />
        <div className="space-y-1">
          <p className="font-semibold text-sm">Reset tidak bisa dibatalkan.</p>
          <p>
            Supabase versi gratis tidak menyediakan backup yang bisa Anda pulihkan sendiri. Wajib unduh backup dulu sebelum reset. Setelah reset, semua
            akun lain (termasuk app di HP) harus login ulang.
          </p>
        </div>
      </div>

      {result && (
        <section className="rounded-2xl border border-emerald-500/40 bg-emerald-950/20 p-4 text-xs text-emerald-100 flex gap-3">
          <Icon name="check_circle" className="text-[22px] text-emerald-400 flex-shrink-0" />
          <div className="space-y-1">
            <p className="font-semibold text-sm">Reset selesai.</p>
            <p>
              Terhapus:{" "}
              {Object.entries(result.counts)
                .filter(([, n]) => n > 0)
                .map(([k, n]) => `${n} ${COUNT_LABEL[k] ?? k}`)
                .join(", ") || "tidak ada data"}
              {result.files ? `, ${result.files} file foto` : ""}
              {result.usersDeleted ? `, ${result.usersDeleted} akun login` : ""}.
            </p>
            <p className="text-emerald-300">
              {result.sessionsCleared
                ? "Semua sesi login lain sudah diakhiri; app di HP akan kembali ke layar login."
                : "Sesi login lain akan berakhir saat tokennya habis (maks. 1 jam)."}
            </p>
          </div>
        </section>
      )}

      {/* Langkah 1: backup */}
      <section className="bg-panel border border-line rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold text-ink flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-cyan-500/15 text-cyan-300 text-xs flex items-center justify-center">1</span>
            Unduh backup database
          </h2>
          <p className="text-[11px] text-gray-400 mt-1">
            Semua tabel (karyawan, cabang, absensi, kasbon, akun, dll) dalam satu file JSON. Foto tidak ikut, API key AI tidak ikut. Simpan di tempat aman.
          </p>
          {backedUpAt && <p className="text-[11px] text-emerald-300 mt-1">Backup diunduh pukul {backedUpAt}. Pastikan file tersimpan sebelum lanjut.</p>}
        </div>
        <a
          href="/pengaturan/reset/backup"
          download
          aria-disabled={!adminApiReady}
          onClick={() => setBackedUpAt(new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }))}
          className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-brand hover:bg-brand/90 text-black text-xs font-semibold shadow-[0_0_15px_rgba(0,210,255,0.25)] transition aria-disabled:opacity-50 aria-disabled:pointer-events-none flex-shrink-0"
        >
          <Icon name="download" className="text-[16px]" />
          Unduh Backup
        </a>
      </section>

      {/* Langkah 2: pilih reset */}
      <section className={`flex flex-col gap-3 ${backedUpAt ? "" : "opacity-50 pointer-events-none"}`} inert={!backedUpAt}>
        <h2 className="text-sm font-bold text-ink flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-cyan-500/15 text-cyan-300 text-xs flex items-center justify-center">2</span>
          Pilih jenis reset
          {!backedUpAt && <span className="text-[11px] font-normal text-gray-400">(unduh backup dulu)</span>}
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              aria-pressed={mode === m.id}
              className={`text-left rounded-2xl border p-5 bg-panel transition ${
                mode === m.id ? (m.id === "total" ? "border-rose-500/70 shadow-[0_0_15px_rgba(244,63,94,0.2)]" : "border-amber-400/70") : "border-line hover:border-line-strong"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-ink">{m.title}</span>
                <Icon name={mode === m.id ? "radio_button_checked" : "radio_button_unchecked"} className="text-[18px] text-gray-400" />
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">{m.desc}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 text-[11px]">
                <ul className="space-y-1">
                  <li className="text-rose-300 font-semibold">Dihapus</li>
                  {m.removes.map((x) => (
                    <li key={x} className="text-gray-300 flex gap-1.5">
                      <Icon name="close" className="text-[13px] text-rose-400 mt-px" />
                      {x}
                    </li>
                  ))}
                </ul>
                <ul className="space-y-1">
                  <li className="text-emerald-300 font-semibold">Tetap</li>
                  {m.keeps.map((x) => (
                    <li key={x} className="text-gray-300 flex gap-1.5">
                      <Icon name="check" className="text-[13px] text-emerald-400 mt-px" />
                      {x}
                    </li>
                  ))}
                </ul>
              </div>
            </button>
          ))}
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => (setError(null), setStep(1))}
            disabled={!backedUpAt || !mode || !adminApiReady}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-500 hover:bg-rose-400 text-white text-xs font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Icon name="restart_alt" className="text-[16px]" />
            {chosen ? `Lanjut ${chosen.title}` : "Pilih jenis reset"}
          </button>
        </div>
        {!adminApiReady && <p className="text-[11px] text-amber-300 text-right">Butuh SUPABASE_SECRET_KEY di server.</p>}
      </section>

      {/* Konfirmasi 1 */}
      <Modal
        open={step === 1}
        title={`Konfirmasi 1 dari 2 · ${chosen?.title ?? ""}`}
        description="Data berikut akan dihapus permanen."
        onClose={close}
        onSubmit={() => (agree ? (setError(null), setStep(2)) : setError("Centang pernyataan di bawah dulu."))}
        submitLabel="Ya, lanjut"
        error={error}
      >
        {chosen && (
          <>
            <ul className="space-y-1.5 text-xs">
              {chosen.removes.map((x) => (
                <li key={x} className="flex gap-2 text-rose-200">
                  <Icon name="delete_forever" className="text-[16px] text-rose-400" />
                  {x}
                </li>
              ))}
            </ul>
            <label className="flex items-start gap-2.5 text-xs text-gray-200 cursor-pointer">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="accent-rose-500 mt-0.5" />
              Saya sudah mengunduh & menyimpan file backup, dan paham data yang dihapus tidak bisa dikembalikan dari aplikasi.
            </label>
          </>
        )}
      </Modal>

      {/* Konfirmasi 2 */}
      <Modal
        open={step === 2}
        title="Konfirmasi 2 dari 2"
        description={`Ketik ${RESET_PHRASE} untuk menjalankan ${chosen?.title ?? "reset"}.`}
        onClose={close}
        onSubmit={run}
        submitLabel={busy ? "Mereset..." : "Reset Sekarang"}
        error={error}
      >
        <input
          className={`${inputCls} font-mono tracking-wider text-center`}
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          placeholder={RESET_PHRASE}
          autoComplete="off"
          spellCheck={false}
          aria-label="Kalimat konfirmasi"
        />
        {mode === "total" && <p className="text-[11px] text-rose-300">Semua akun login lain akan dihapus dan harus dibuat ulang.</p>}
      </Modal>
    </>
  );
}
