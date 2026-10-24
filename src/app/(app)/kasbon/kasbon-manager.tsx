"use client";

import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, m } from "motion/react";
import { Icon } from "@/components/icon";
import { confirmDialog } from "@/components/confirm-dialog";
import { POP } from "@/components/motion";
import { PopupLayer } from "@/components/popup-overlay";
import { cancelKasbon, decideKasbon, disburseKasbon, requestKasbon, settleKasbon } from "@/lib/actions/kasbon";
import type { KasbonItem, KasbonQuota, getKasbonPage } from "@/lib/data/kasbon";
import { formatDateShort, formatRupiah } from "@/lib/format";
import { KASBON_STATUS_LABEL, type KasbonStatus } from "@/lib/labels";
import { Field, Modal, Pagination, Toast, filterCls, inputCls, useToastTimer } from "../pengaturan/_components/ui";

type PageData = Awaited<ReturnType<typeof getKasbonPage>>;
type Dialog =
  | { kind: "request" }
  | { kind: "decide"; item: KasbonItem; approve: boolean }
  | { kind: "disburse"; item: KasbonItem }
  | null;
type StatusFilter = "" | "perlu" | KasbonStatus;

const PER_PAGE = 10;

const PILL: Record<KasbonStatus, string> = {
  diajukan: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  disetujui: "bg-cyan-500/10 text-cyan-300 border-cyan-500/30",
  ditolak: "bg-rose-500/10 text-rose-300 border-rose-500/30",
  dicairkan: "bg-purple-500/10 text-purple-300 border-purple-500/30",
  lunas: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  dibatalkan: "bg-panel-raised text-gray-400 border-line-strong",
};

const periodLabel = (start: string, end: string) => `${formatDateShort(start)} s/d ${formatDateShort(end)}`;
const stamp = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Angka rupiah dari input bebas ("1.500.000" → 1500000). */
const parseAmount = (v: string) => Number(v.replace(/\D/g, "") || 0);
const groupDigits = (n: number) => (n ? new Intl.NumberFormat("id-ID").format(n) : "");

export function KasbonManager({ data, today }: { data: PageData; today: string }) {
  if (!data.ready) {
    return (
      <div role="alert" className="rounded-2xl border border-amber-500/40 bg-amber-950/30 p-4 text-xs text-amber-200 flex gap-3">
        <Icon name="warning" className="text-[20px] text-amber-400 flex-shrink-0" />
        <p>
          Fitur kasbon belum aktif.{" "}
          {data.role === "admin" ? (
            <>
              Jalankan <code className="font-mono">supabase/migrations/20261025000000_kasbon.sql</code> di SQL Editor Supabase, lalu muat ulang
              halaman.
            </>
          ) : (
            "Hubungi admin."
          )}
        </p>
      </div>
    );
  }
  return <KasbonView {...data} today={today} />;
}

function KasbonView({
  role,
  quota,
  quotaError,
  items,
  today,
}: Extract<PageData, { ready: true }> & { today: string }) {
  const router = useRouter();
  const isAdmin = role === "admin";
  const [dialog, setDialog] = useState<Dialog>(null);
  const [proof, setProof] = useState<KasbonItem | null>(null);
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, startBusy] = useTransition();
  const clearToast = useCallback(() => setToast(null), []);
  useToastTimer(toast, clearToast);

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>(isAdmin ? "perlu" : "");
  const [page, setPage] = useState(1);

  const effective = (k: KasbonItem): KasbonStatus => (k.autoSettled ? "lunas" : k.status);
  const q = query.trim().toLowerCase();
  const filtered = items.filter(
    (k) =>
      (!status || (status === "perlu" ? k.status === "diajukan" || k.status === "disetujui" : effective(k) === status)) &&
      (!q || k.name.toLowerCase().includes(q) || k.nik.toLowerCase().includes(q)),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * PER_PAGE, current * PER_PAGE);

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string) =>
    startBusy(async () => {
      const res = await fn();
      setToast(res.ok ? { text: success, error: false } : { text: res.error, error: true });
      if (res.ok) router.refresh();
    });

  const cancel = async (k: KasbonItem) => {
    const ok = await confirmDialog({ title: "Batalkan pengajuan kasbon?", message: `Pengajuan ${formatRupiah(k.amount)} akan dibatalkan.`, confirmLabel: "Batalkan pengajuan", tone: "warning" });
    if (!ok) return;
    run(() => cancelKasbon(k.id), "Pengajuan kasbon dibatalkan.");
  };
  const settle = async (k: KasbonItem) => {
    const ok = await confirmDialog({ title: "Tandai kasbon lunas?", message: `${k.name} · ${formatRupiah(k.amount)}`, confirmLabel: "Tandai lunas" });
    if (!ok) return;
    run(() => settleKasbon(k.id), "Kasbon ditandai lunas.");
  };

  const pending = items.filter((k) => k.status === "diajukan").length;
  const toDisburse = items.filter((k) => k.status === "disetujui").length;
  const periodDisbursed = quota
    ? items.filter((k) => k.periodStart === quota.periodStart && (k.status === "dicairkan" || k.status === "lunas")).reduce((s, k) => s + k.amount, 0)
    : null;

  return (
    <>
      <QuotaCard quota={quota} quotaError={quotaError} isAdmin={isAdmin} onRequest={() => setDialog({ kind: "request" })} />

      {isAdmin && (
        <section aria-label="Ringkasan kasbon" className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { label: "Menunggu persetujuan", value: String(pending), unit: "pengajuan", tone: "text-amber-300" },
            { label: "Disetujui, belum dicairkan", value: String(toDisburse), unit: "pengajuan", tone: "text-brand-ink" },
            ...(periodDisbursed !== null ? [{ label: "Dicairkan periode ini", value: formatRupiah(periodDisbursed), unit: "total", tone: "text-purple-300" }] : []),
          ].map((s) => (
            <div key={s.label} className="bg-panel border border-line rounded-2xl p-4">
              <div className="text-[11px] text-gray-400">{s.label}</div>
              <div className={`text-2xl font-bold mt-1 tabular-nums ${s.tone}`}>{s.value}</div>
              <div className="text-[10px] text-gray-500 mt-0.5">{s.unit}</div>
            </div>
          ))}
        </section>
      )}

      <section aria-labelledby="kasbon-title" className="bg-panel border border-line rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-line flex flex-col gap-3">
          <div>
            <h2 id="kasbon-title" className="text-sm font-bold text-ink flex items-center gap-2">
              {isAdmin ? "Riwayat Kasbon Karyawan" : "Riwayat Kasbon Saya"}
              <span className="text-[11px] font-mono font-normal text-cyan-300">{filtered.length} Kasbon</span>
            </h2>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Kasbon dilunasi lewat potong gaji di akhir periode gajian. Pengajuan yang masih diproses ikut mengurangi sisa plafon.
            </p>
          </div>
          <div className="flex flex-col md:flex-row md:items-center gap-2 text-xs">
            {isAdmin && (
              <div className="relative md:flex-1 md:max-w-xs">
                <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-gray-500 pointer-events-none" />
                <input
                  value={query}
                  onChange={(e) => (setQuery(e.target.value), setPage(1))}
                  placeholder="Cari nama atau NIK..."
                  aria-label="Cari karyawan"
                  className={`${filterCls} w-full pl-9 pr-3 py-2 placeholder-gray-500`}
                />
              </div>
            )}
            <select
              value={status}
              onChange={(e) => (setStatus(e.target.value as StatusFilter), setPage(1))}
              aria-label="Filter status"
              className={`${filterCls} py-2 px-3`}
            >
              <option value="">Semua status</option>
              <option value="perlu">Perlu tindakan</option>
              {(Object.keys(KASBON_STATUS_LABEL) as KasbonStatus[]).map((s) => (
                <option key={s} value={s}>
                  {KASBON_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse min-w-[760px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-gray-400 border-b border-line">
                <th scope="col" className="py-3 px-5 font-semibold">Diajukan</th>
                {isAdmin && <th scope="col" className="py-3 px-4 font-semibold">Karyawan</th>}
                <th scope="col" className="py-3 px-4 font-semibold text-right">Nominal</th>
                <th scope="col" className="py-3 px-4 font-semibold">Periode</th>
                <th scope="col" className="py-3 px-4 font-semibold">Status</th>
                <th scope="col" className="py-3 px-4 font-semibold">Catatan</th>
                <th scope="col" className="py-3 px-5 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visible.map((k) => {
                const st = effective(k);
                const mine = quota?.employeeId === k.employeeId;
                return (
                  <tr key={k.id} className="hover:bg-panel-raised/40">
                    <td className="py-3 px-5 text-gray-300 whitespace-nowrap">{stamp(k.requestedAt)}</td>
                    {isAdmin && (
                      <td className="py-3 px-4">
                        <div className="text-gray-100 font-medium">{k.name}</div>
                        <div className="text-[10px] text-gray-500 font-mono">{k.nik}</div>
                      </td>
                    )}
                    <td className="py-3 px-4 text-right">
                      <div className="text-gray-100 font-semibold tabular-nums">{formatRupiah(k.amount)}</div>
                      <div className="text-[10px] text-gray-500">
                        plafon {formatRupiah(k.plafon)} · {k.hk} HK
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-400 whitespace-nowrap">{periodLabel(k.periodStart, k.periodEnd)}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-block px-2 py-0.5 rounded-full border text-[11px] font-semibold ${PILL[st]}`}>{KASBON_STATUS_LABEL[st]}</span>
                      {k.autoSettled && <div className="text-[10px] text-gray-500 mt-0.5">potong gaji</div>}
                    </td>
                    <td className="py-3 px-4 text-gray-400 max-w-[220px]">
                      {k.note && <div className="truncate" title={k.note}>{k.note}</div>}
                      {k.decisionNote && (
                        <div className="truncate text-[10px] text-gray-500" title={k.decisionNote}>
                          Admin: {k.decisionNote}
                        </div>
                      )}
                      {!k.note && !k.decisionNote && <span className="text-gray-600">-</span>}
                    </td>
                    <td className="py-3 px-5">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        {k.proofUrl && (
                          <ActionButton icon="image" onClick={() => setProof(k)}>
                            Bukti
                          </ActionButton>
                        )}
                        {isAdmin && k.status === "diajukan" && (
                          <>
                            <ActionButton icon="check" tone="ok" disabled={busy} onClick={() => setDialog({ kind: "decide", item: k, approve: true })}>
                              Setujui
                            </ActionButton>
                            <ActionButton icon="close" tone="danger" disabled={busy} onClick={() => setDialog({ kind: "decide", item: k, approve: false })}>
                              Tolak
                            </ActionButton>
                          </>
                        )}
                        {isAdmin && k.status === "disetujui" && (
                          <ActionButton icon="payments" tone="ok" disabled={busy} onClick={() => setDialog({ kind: "disburse", item: k })}>
                            Cairkan
                          </ActionButton>
                        )}
                        {isAdmin && k.status === "dicairkan" && !k.autoSettled && (
                          <ActionButton icon="task_alt" disabled={busy} onClick={() => settle(k)}>
                            Lunas
                          </ActionButton>
                        )}
                        {mine && k.status === "diajukan" && (
                          <ActionButton icon="undo" disabled={busy} onClick={() => cancel(k)}>
                            Batalkan
                          </ActionButton>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 7 : 6} className="py-10 text-center text-gray-400">
                    {items.length === 0 ? "Belum ada kasbon." : "Tidak ada kasbon yang cocok dengan filter."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-line flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-400">
            <span>
              Menampilkan {(current - 1) * PER_PAGE + 1}-{Math.min(current * PER_PAGE, filtered.length)} dari {filtered.length} kasbon
            </span>
            <Pagination page={current} pages={pages} onPage={setPage} />
          </div>
        )}
      </section>

      {quota && (
        <RequestDialog
          open={dialog?.kind === "request"}
          quota={quota}
          onClose={() => setDialog(null)}
          onDone={() => (setDialog(null), setToast({ text: "Kasbon diajukan. Menunggu persetujuan admin.", error: false }), router.refresh())}
        />
      )}
      <DecideDialog
        dialog={dialog?.kind === "decide" ? dialog : null}
        onClose={() => setDialog(null)}
        onDone={(text) => (setDialog(null), setToast({ text, error: false }), router.refresh())}
      />
      <DisburseDialog
        item={dialog?.kind === "disburse" ? dialog.item : null}
        onClose={() => setDialog(null)}
        onDone={() => (setDialog(null), setToast({ text: "Kasbon dicairkan, bukti tersimpan.", error: false }), router.refresh())}
      />
      <ProofViewer item={proof} today={today} onClose={() => setProof(null)} />
      <Toast toast={toast} />
    </>
  );
}

function ActionButton({
  icon,
  tone,
  children,
  ...props
}: { icon: string; tone?: "ok" | "danger" } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const color =
    tone === "ok"
      ? "border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
      : tone === "danger"
        ? "border-rose-500/40 text-rose-300 hover:bg-rose-500/10"
        : "border-line-strong text-gray-300 hover:text-brand-ink hover:border-cyan-500/50";
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition disabled:opacity-50 ${color}`}
    >
      <Icon name={icon} className="text-[14px]" />
      {children}
    </button>
  );
}

/* ------------------------------- Kartu plafon ------------------------------- */

function QuotaCard({
  quota,
  quotaError,
  isAdmin,
  onRequest,
}: {
  quota: KasbonQuota | null;
  quotaError: string | null;
  isAdmin: boolean;
  onRequest: () => void;
}) {
  if (!quota) {
    return (
      <section className="rounded-2xl border border-line bg-panel p-4 text-xs text-gray-300 flex gap-3 items-start">
        <Icon name="info" className="text-[20px] text-brand-ink flex-shrink-0" />
        <p>
          {quotaError ?? "Plafon kasbon belum bisa dihitung."}
          {isAdmin && (
            <>
              {" "}
              Untuk mengajukan kasbon sendiri, hubungkan akun admin ke data karyawan di{" "}
              <Link href="/pengaturan/akses" className="text-brand-ink underline underline-offset-2">
                Pengguna &amp; Akses
              </Link>
              .
            </>
          )}
        </p>
      </section>
    );
  }

  const noSalary = quota.salarySource === null;
  const usedPct = quota.plafon > 0 ? Math.min(100, Math.round((quota.used / quota.plafon) * 100)) : 0;

  return (
    <section aria-labelledby="plafon-title" className="bg-panel border border-line rounded-2xl p-5 flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h2 id="plafon-title" className="text-sm font-bold text-ink flex items-center gap-2">
            <Icon name="account_balance_wallet" className="text-[18px] text-brand-ink" />
            Plafon Kasbon Saya
          </h2>
          <p className="text-[11px] text-gray-400 mt-0.5">Periode gajian {periodLabel(quota.periodStart, quota.periodEnd)}</p>
        </div>
        <button
          type="button"
          onClick={onRequest}
          disabled={noSalary || quota.available <= 0}
          className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-brand hover:bg-brand/90 text-black text-xs font-semibold shadow-[0_0_15px_rgba(0,210,255,0.25)] transition disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed"
        >
          <Icon name="add" className="text-[16px]" />
          Ajukan Kasbon
        </button>
      </div>

      {noSalary ? (
        <p className="text-xs text-amber-300 bg-amber-950/30 border border-amber-500/30 rounded-lg px-3 py-2">
          Gaji pokok Anda belum diatur, jadi plafon belum bisa dihitung.{" "}
          {isAdmin ? (
            <Link href="/kasbon/pengaturan" className="underline underline-offset-2">
              Atur di Pengaturan Kasbon
            </Link>
          ) : (
            "Hubungi admin."
          )}
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "Gaji pokok", value: formatRupiah(quota.baseSalary), note: quota.salarySource === "karyawan" ? "khusus karyawan" : "sesuai jabatan" },
              { label: "Upah harian", value: formatRupiah(quota.dailyRate), note: `gaji ÷ ${quota.dailyDivisor} hari` },
              { label: "Hari kerja (HK)", value: `${quota.hk} hari`, note: "status Hadir periode ini" },
              { label: "Plafon", value: formatRupiah(quota.plafon), note: "upah yang sudah berjalan" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-panel-inset border border-line px-3.5 py-3">
                <dt className="text-[11px] text-gray-400">{s.label}</dt>
                <dd className="text-base font-bold text-ink tabular-nums mt-0.5">{s.value}</dd>
                <dd className="text-[10px] text-gray-500">{s.note}</dd>
              </div>
            ))}
          </dl>
          <div>
            <div className="flex items-end justify-between gap-3 text-xs">
              <span className="text-gray-400">
                Terpakai <span className="text-gray-200 font-semibold tabular-nums">{formatRupiah(quota.used)}</span>
              </span>
              <span className="text-gray-400">
                Sisa plafon <span className="text-lg font-bold text-emerald-300 tabular-nums">{formatRupiah(quota.available)}</span>
              </span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-panel-inset overflow-hidden" role="presentation">
              <div className="h-full rounded-full bg-brand" style={{ width: `${usedPct}%` }} />
            </div>
            <p className="text-[10px] text-gray-500 mt-2 font-mono">
              {formatRupiah(quota.baseSalary)} ÷ {quota.dailyDivisor} × {quota.hk} HK = {formatRupiah(quota.plafon)}
            </p>
          </div>
        </>
      )}
    </section>
  );
}

/* --------------------------------- Dialog --------------------------------- */

function RequestDialog({ open, quota, onClose, onDone }: { open: boolean; quota: KasbonQuota; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();

  const close = () => (setAmount(0), setNote(""), setError(null), onClose());
  const submit = () =>
    startBusy(async () => {
      if (amount <= 0) return setError("Isi nominal kasbon.");
      if (amount > quota.available) return setError(`Nominal melebihi sisa plafon (${formatRupiah(quota.available)}).`);
      const res = await requestKasbon(amount, note);
      if (!res.ok) return setError(res.error);
      setAmount(0);
      setNote("");
      setError(null);
      onDone();
    });

  return (
    <Modal
      open={open}
      title="Ajukan Kasbon"
      description={`Sisa plafon periode ini ${formatRupiah(quota.available)}. Dilunasi lewat potong gaji.`}
      onClose={close}
      onSubmit={submit}
      submitLabel={busy ? "Mengirim..." : "Ajukan"}
      error={error}
    >
      <Field label="Nominal (Rp)" hint={`Maksimal ${formatRupiah(quota.available)}.`}>
        <input
          inputMode="numeric"
          className={`${inputCls} text-base font-semibold tabular-nums`}
          value={groupDigits(amount)}
          onChange={(e) => setAmount(parseAmount(e.target.value))}
          placeholder="0"
          required
        />
      </Field>
      <div className="flex flex-wrap gap-1.5">
        {[0.25, 0.5, 1].map((f) => {
          const v = Math.floor(quota.available * f);
          return (
            <button
              key={f}
              type="button"
              onClick={() => setAmount(v)}
              disabled={v <= 0}
              className="px-2.5 py-1 rounded-lg border border-line-strong text-[11px] text-gray-300 hover:text-brand-ink hover:border-cyan-500/50 disabled:opacity-40"
            >
              {f === 1 ? "Semua" : `${f * 100}%`} · {formatRupiah(v)}
            </button>
          );
        })}
      </div>
      <Field label="Keperluan (opsional)" hint="Maks. 200 karakter.">
        <textarea className={`${inputCls} resize-none`} rows={2} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Modal>
  );
}

function DecideDialog({
  dialog,
  onClose,
  onDone,
}: {
  dialog: { item: KasbonItem; approve: boolean } | null;
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();
  const close = () => (setNote(""), setError(null), onClose());
  const submit = () =>
    startBusy(async () => {
      if (!dialog) return;
      const res = await decideKasbon(dialog.item.id, dialog.approve, note);
      if (!res.ok) return setError(res.error);
      setNote("");
      setError(null);
      onDone(dialog.approve ? "Kasbon disetujui. Lanjutkan pencairan & unggah bukti." : "Kasbon ditolak.");
    });

  return (
    <Modal
      open={dialog !== null}
      title={dialog?.approve ? "Setujui Kasbon" : "Tolak Kasbon"}
      description={dialog ? `${dialog.item.name} (${dialog.item.nik}) · ${formatRupiah(dialog.item.amount)}` : undefined}
      onClose={close}
      onSubmit={submit}
      submitLabel={busy ? "Menyimpan..." : dialog?.approve ? "Setujui" : "Tolak"}
      error={error}
    >
      {dialog && (
        <>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <dt className="text-gray-500">Plafon saat diajukan</dt>
            <dd className="text-gray-200 text-right tabular-nums">
              {formatRupiah(dialog.item.plafon)} · {dialog.item.hk} HK
            </dd>
            <dt className="text-gray-500">Periode</dt>
            <dd className="text-gray-200 text-right">{periodLabel(dialog.item.periodStart, dialog.item.periodEnd)}</dd>
            {dialog.item.note && (
              <>
                <dt className="text-gray-500">Keperluan</dt>
                <dd className="text-gray-200 text-right">{dialog.item.note}</dd>
              </>
            )}
          </dl>
          <Field label={dialog.approve ? "Catatan (opsional)" : "Alasan penolakan (opsional)"} hint="Terlihat oleh karyawan. Maks. 200 karakter.">
            <textarea className={`${inputCls} resize-none`} rows={2} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </>
      )}
    </Modal>
  );
}

/** Perkecil foto di browser (maks. 1600 px, JPEG) supaya muat batas upload server action. */
async function compressImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.82, 0.7, 0.55]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
    if (blob && blob.size <= 900 * 1024) return new File([blob], "bukti.jpg", { type: "image/jpeg" });
  }
  throw new Error("Foto terlalu besar, coba foto lain.");
}

function DisburseDialog({ item, onClose, onDone }: { item: KasbonItem | null; onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();

  const reset = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    setError(null);
  };
  const close = () => (reset(), onClose());

  const pick = async (f: File | undefined) => {
    setError(null);
    if (!f) return;
    if (!f.type.startsWith("image/")) return setError("Bukti harus berupa foto.");
    try {
      const small = await compressImage(f);
      if (preview) URL.revokeObjectURL(preview);
      setFile(small);
      setPreview(URL.createObjectURL(small));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Foto tidak bisa dibaca.");
    }
  };

  const submit = () =>
    startBusy(async () => {
      if (!item) return;
      if (!file) return setError("Pilih foto bukti transfer / serah terima.");
      const form = new FormData();
      form.set("id", item.id);
      form.set("employeeId", item.employeeId);
      form.set("proof", file);
      const res = await disburseKasbon(form);
      if (!res.ok) return setError(res.error);
      reset();
      onDone();
    });

  return (
    <Modal
      open={item !== null}
      title="Cairkan Kasbon"
      description={item ? `${item.name} (${item.nik}) · ${formatRupiah(item.amount)}` : undefined}
      onClose={close}
      onSubmit={submit}
      submitLabel={busy ? "Mengunggah..." : "Tandai Dicairkan"}
      error={error}
    >
      <Field label="Bukti pencairan" hint="Foto bukti transfer atau serah terima uang. Disimpan privat, hanya admin & karyawan ybs yang bisa melihat.">
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => pick(e.target.files?.[0])}
          className="block w-full text-xs text-gray-300 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border file:border-line-strong file:bg-panel file:text-gray-200 file:text-xs hover:file:border-cyan-500/50"
        />
      </Field>
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="Pratinjau bukti pencairan" className="w-full max-h-72 object-contain rounded-lg bg-black border border-line" />
      )}
    </Modal>
  );
}

function ProofViewer({ item, today, onClose }: { item: KasbonItem | null; today: string; onClose: () => void }) {
  return (
    <AnimatePresence>
      {item?.proofUrl && (
        <PopupLayer key={item.id} onClose={onClose}>
          <m.div
            {...POP}
            role="dialog"
            aria-modal="true"
            aria-label={`Bukti pencairan kasbon ${item.name}`}
            className="relative w-full max-w-md bg-panel-inset border border-line-strong rounded-2xl overflow-hidden shadow-2xl"
          >
            <div className="px-4 py-3 border-b border-line-strong flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-ink truncate">Bukti Pencairan · {formatRupiah(item.amount)}</p>
                <p className="text-[11px] text-gray-400">
                  {item.name} · {item.disbursedAt ? stamp(item.disbursedAt) : "-"}
                  {item.periodEnd < today && item.status === "dicairkan" && " · lunas lewat potong gaji"}
                </p>
              </div>
              <button type="button" onClick={onClose} aria-label="Tutup" className="p-1 rounded-lg text-gray-400 hover:text-ink hover:bg-panel">
                <Icon name="close" className="text-[20px]" />
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.proofUrl} alt={`Bukti pencairan kasbon ${item.name}`} className="w-full max-h-[70vh] object-contain bg-black" />
          </m.div>
        </PopupLayer>
      )}
    </AnimatePresence>
  );
}
