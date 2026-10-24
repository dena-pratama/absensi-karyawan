"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { deactivateConnector, deleteConnector, saveConnector, testConnector } from "@/lib/actions/ai-connector";
import { AI_PROVIDERS, needsBaseUrl, type AiProvider, type ConnectorInfo } from "@/lib/ai/providers";
import { Field, inputCls, Toast, useToastTimer } from "../_components/ui";

const PROVIDERS = Object.keys(AI_PROVIDERS) as AiProvider[];

const PROVIDER_ACCENT: Record<AiProvider, string> = {
  anthropic: "from-[#d97757]/30 to-transparent text-[#f0a37f]",
  openai: "from-emerald-500/25 to-transparent text-emerald-300",
  gemini: "from-sky-500/25 to-transparent text-sky-300",
  deepseek: "from-blue-600/25 to-transparent text-blue-300",
  openrouter: "from-indigo-500/25 to-transparent text-indigo-300",
  groq: "from-orange-500/25 to-transparent text-orange-300",
  mistral: "from-amber-500/25 to-transparent text-amber-300",
  xai: "from-slate-400/20 to-transparent text-slate-200",
  ollama: "from-zinc-300/15 to-transparent text-zinc-200",
  custom: "from-purple-500/20 to-transparent text-purple-300",
};

const keyLabel = (c: ConnectorInfo) => (c.last4 ? `Key ••••${c.last4}` : "Tanpa key");

function formatUpdated(iso: string) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function ConnectorManager({
  connectors,
  tableMissing,
  keyConfigured,
}: {
  connectors: ConnectorInfo[];
  tableMissing: boolean;
  keyConfigured: boolean;
}) {
  const router = useRouter();
  const byProvider = new Map(connectors.map((c) => [c.provider, c]));
  const active = connectors.find((c) => c.isActive);

  const [selected, setSelected] = useState<AiProvider>(active?.provider ?? "anthropic");
  const saved = byProvider.get(selected);
  const [model, setModel] = useState(saved?.model ?? AI_PROVIDERS[selected].defaultModel);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(saved?.baseUrl ?? "");
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, startBusy] = useTransition();
  const clearToast = useCallback(() => setToast(null), []);
  useToastTimer(toast, clearToast);

  const disabled = tableMissing || !keyConfigured;

  const choose = (p: AiProvider) => {
    setSelected(p);
    setModel(byProvider.get(p)?.model ?? AI_PROVIDERS[p].defaultModel);
    setApiKey("");
    setBaseUrl(byProvider.get(p)?.baseUrl ?? "");
    setModels([]);
  };
  const meta = AI_PROVIDERS[selected];
  const withUrl = needsBaseUrl(selected);

  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    startBusy(async () => {
      const res = await fn();
      setToast(res.ok ? { text: res.message ?? "Berhasil.", error: false } : { text: res.error ?? "Gagal.", error: true });
      if (res.ok) {
        setApiKey("");
        router.refresh();
      }
    });

  const test = () =>
    startBusy(async () => {
      const res = await testConnector(selected, apiKey, baseUrl);
      if (res.ok) {
        setModels(res.models);
        setToast({ text: `Koneksi berhasil, ${res.models.length} model tersedia.`, error: false });
      } else {
        setToast({ text: res.error, error: true });
      }
    });

  return (
    <>
      {(tableMissing || !keyConfigured) && (
        <div role="alert" className="rounded-2xl border border-amber-500/40 bg-amber-950/30 p-4 text-xs text-amber-200 flex gap-3">
          <Icon name="warning" className="text-[20px] text-amber-400 flex-shrink-0" />
          <div className="space-y-1">
            {tableMissing && (
              <p>
                Tabel <code className="font-mono">ai_connector</code> belum ada. Jalankan{" "}
                <code className="font-mono">supabase/migrations/20261020010000_ai_connector.sql</code> di SQL Editor Supabase, lalu muat
                ulang halaman.
              </p>
            )}
            {!keyConfigured && (
              <p>
                <code className="font-mono">AI_ENCRYPTION_KEY</code> belum diatur di <code className="font-mono">.env.local</code>. Restart
                dev server setelah mengisinya.
              </p>
            )}
          </div>
        </div>
      )}

      {active?.limitedAt && (
        <div role="alert" className="rounded-2xl border border-amber-500/50 bg-amber-950/30 p-4 text-xs text-amber-100 flex gap-3">
          <Icon name="speed" className="text-[22px] text-amber-400 flex-shrink-0" />
          <div className="space-y-1">
            <p className="font-semibold text-sm">
              {AI_PROVIDERS[active.provider].label} · {active.model} kena limit ({formatUpdated(active.limitedAt)})
            </p>
            <p>{active.limitMessage}</p>
            <p className="text-amber-300">
              Pilih provider lain di bawah (mis. yang sudah Tersimpan), lalu klik Simpan &amp; Aktifkan. Atau ganti model di provider yang sama lalu Simpan.
            </p>
          </div>
        </div>
      )}

      {/* Kartu provider */}
      <section aria-label="Pilih provider" className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {PROVIDERS.map((p) => {
          const c = byProvider.get(p);
          const isSelected = p === selected;
          return (
            <button
              key={p}
              type="button"
              onClick={() => choose(p)}
              aria-pressed={isSelected}
              className={`relative overflow-hidden text-left rounded-2xl border p-4 transition bg-panel min-w-0 ${
                isSelected ? "border-cyan-400/70 shadow-[0_0_15px_rgba(0,210,255,0.18)]" : "border-line hover:border-line-strong"
              }`}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${PROVIDER_ACCENT[p]} opacity-60 pointer-events-none`} />
              <div className="relative flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-bold text-ink leading-tight">{AI_PROVIDERS[p].label}</span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full border ${
                      "flex-shrink-0 " +
                      (c?.limitedAt
                        ? "bg-amber-500/15 text-amber-300 border-amber-500/40"
                        : c?.isActive
                        ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                        : c
                          ? "bg-cyan-500/10 text-cyan-300 border-cyan-500/30"
                          : "bg-gray-500/10 text-gray-400 border-gray-500/30")
                    }`}
                  >
                    {c?.limitedAt ? "Kena limit" : c?.isActive ? "● Aktif" : c ? "Tersimpan" : "Belum"}
                  </span>
                </div>
                <div className="text-xs text-gray-300 font-mono truncate">{c?.model ?? "-"}</div>
                <div className="text-[10px] text-gray-400 truncate" title={c ? `diperbarui ${formatUpdated(c.updatedAt)}` : undefined}>
                  {c ? keyLabel(c) : "Klik untuk mengatur"}
                </div>
              </div>
            </button>
          );
        })}
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Form konektor */}
        <section aria-labelledby="form-title" className="xl:col-span-8 bg-panel border border-line rounded-2xl p-5 flex flex-col gap-4">
          <div>
            <h2 id="form-title" className="text-sm font-bold text-ink flex items-center gap-2">
              <Icon name="hub" className="text-[18px] text-cyan-400" />
              Konektor {AI_PROVIDERS[selected].label}
            </h2>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {selected === "custom" ? "API key dari provider pilihan Anda" : meta.keyOptional ? "API key opsional, lihat" : "Dapatkan API key di"}{" "}
              {selected !== "custom" && (
                <a href={meta.keyUrl} target="_blank" rel="noreferrer" className="text-cyan-400 hover:text-cyan-300 underline">
                  {new URL(meta.keyUrl).hostname}
                </a>
              )}
              . Hanya satu konektor yang aktif dipakai Smart AI.
            </p>
            {meta.note && (
              <p className="mt-2 text-[11px] text-amber-200 bg-amber-950/25 border border-amber-500/30 rounded-lg px-3 py-2 flex gap-2">
                <Icon name="info" className="text-[15px] text-amber-400 flex-shrink-0" />
                <span>{meta.note}</span>
              </p>
            )}
          </div>

          {withUrl && (
            <Field label="Base URL" hint="Alamat API yang kompatibel dengan OpenAI, biasanya diakhiri /v1.">
              <input
                type="url"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                className={`${inputCls} font-mono`}
                placeholder={meta.baseUrlPlaceholder}
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                disabled={disabled}
              />
            </Field>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field
              label={meta.keyOptional ? "API Key (opsional)" : "API Key"}
              hint={
                saved?.last4
                  ? `Kosongkan untuk tetap memakai key tersimpan (••••${saved.last4}).`
                  : meta.keyOptional
                    ? "Kosongkan bila server tidak memakai key. Disimpan terenkripsi di server."
                    : "Disimpan terenkripsi di server, tidak pernah dikirim ke browser."
              }
            >
              <span className="relative block">
                <input
                  type={showKey ? "text" : "password"}
                  autoComplete="off"
                  spellCheck={false}
                  className={`${inputCls} font-mono pr-10`}
                  placeholder={saved?.last4 ? `••••••••${saved.last4}` : meta.keyHint}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  disabled={disabled}
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  aria-label={showKey ? "Sembunyikan key" : "Tampilkan key"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-200"
                >
                  <Icon name={showKey ? "visibility_off" : "visibility"} className="text-[16px]" />
                </button>
              </span>
            </Field>
            <Field label="Model" hint={models.length ? `${models.length} model dari hasil tes koneksi. Ketik untuk mencari.` : "Klik Tes Koneksi untuk memuat daftar model."}>
              <input
                list="ai-models"
                className={`${inputCls} font-mono`}
                placeholder={AI_PROVIDERS[selected].defaultModel || "nama model"}
                value={model}
                onChange={(e) => setModel(e.target.value)}
                disabled={disabled}
              />
              <datalist id="ai-models">
                {models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs pt-1">
            <button
              type="button"
              onClick={test}
              disabled={busy || disabled}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-line-strong bg-panel-raised text-gray-200 hover:text-brand-ink hover:border-brand/40 transition disabled:opacity-50"
            >
              <Icon name="network_check" className="text-[16px]" />
              Tes Koneksi
            </button>
            <button
              type="button"
              onClick={() => run(() => saveConnector({ provider: selected, model, apiKey, baseUrl, activate: saved?.isActive ?? false }))}
              disabled={busy || disabled || !model.trim()}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-line-strong bg-panel-raised text-gray-200 hover:text-brand-ink hover:border-brand/40 transition disabled:opacity-50"
            >
              <Icon name="save" className="text-[16px]" />
              Simpan
            </button>
            {!saved?.isActive && (
              <button
                type="button"
                onClick={() => run(() => saveConnector({ provider: selected, model, apiKey, baseUrl, activate: true }))}
                disabled={busy || disabled || !model.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand hover:bg-brand/90 text-black font-semibold shadow-[0_0_15px_rgba(0,210,255,0.25)] transition disabled:opacity-50"
              >
                <Icon name="bolt" className="text-[16px]" />
                Simpan &amp; Aktifkan
              </button>
            )}
            {saved?.isActive && (
              <button
                type="button"
                onClick={() => run(() => deactivateConnector(selected))}
                disabled={busy}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-amber-500/40 bg-amber-950/20 text-amber-300 hover:bg-amber-950/40 transition disabled:opacity-50"
              >
                <Icon name="pause_circle" className="text-[16px]" />
                Nonaktifkan
              </button>
            )}
            {saved && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Hapus konektor ${AI_PROVIDERS[selected].label} beserta API key-nya?`)) run(() => deleteConnector(selected));
                }}
                disabled={busy}
                className="ml-auto flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-rose-500/40 text-rose-300 hover:bg-rose-950/30 transition disabled:opacity-50"
              >
                <Icon name="delete" className="text-[16px]" />
                Hapus
              </button>
            )}
            {busy && <span className="w-4 h-4 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" aria-label="Memproses" />}
          </div>
        </section>

        {/* Info */}
        <aside className="xl:col-span-4 bg-panel border border-line rounded-2xl p-5 flex flex-col gap-3 text-xs text-gray-300">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-200">Cara Kerja Smart AI</h2>
          <ul className="flex flex-col gap-2.5">
            {[
              ["lock", "API key dienkripsi AES-256 di server dan hanya dipakai saat memanggil provider."],
              ["query_stats", "AI membaca data absensi, cabang, dan karyawan lewat tool internal aplikasi (data asli, bukan tebakan)."],
              ["verified_user", "Setiap perubahan absensi dari AI muncul sebagai kartu usulan dan baru tersimpan setelah Anda menekan Setujui."],
              ["payments", "Biaya pemakaian ditagih oleh provider sesuai akun API key Anda."],
            ].map(([icon, text]) => (
              <li key={icon} className="flex gap-2.5">
                <Icon name={icon} className="text-[16px] text-cyan-400 flex-shrink-0 mt-px" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-gray-500 pt-2 border-t border-line">
            Konektor aktif: <span className="text-gray-200">{active ? `${AI_PROVIDERS[active.provider].label} · ${active.model}` : "belum ada"}</span>
          </p>
        </aside>
      </div>

      <Toast toast={toast} />
    </>
  );
}
