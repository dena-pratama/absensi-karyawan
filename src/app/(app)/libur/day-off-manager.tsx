"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmDialog } from "@/components/confirm-dialog";
import { Icon } from "@/components/icon";
import { decideDayOff, decideSwap } from "@/lib/actions/day-off";
import type { DayOffItem, DayOffStatus, SwapStatus, getDayOffPage } from "@/lib/data/day-off";
import { formatDateLong } from "@/lib/format";
import { Pagination, Toast, filterCls, useToastTimer } from "../pengaturan/_components/ui";

type PageData = Awaited<ReturnType<typeof getDayOffPage>>;
type View = "aktif" | "menunggu" | "riwayat" | "semua";

const PER_PAGE = 15;

const STATUS: Record<DayOffStatus, { label: string; cls: string }> = {
  diajukan: { label: "Menunggu", cls: "bg-amber-500/10 text-amber-300 border-amber-500/30" },
  disetujui: { label: "Disetujui", cls: "bg-sky-500/10 text-sky-300 border-sky-500/30" },
  ditolak: { label: "Ditolak", cls: "bg-rose-500/10 text-rose-300 border-rose-500/30" },
  dibatalkan: { label: "Dibatalkan", cls: "bg-panel-raised text-gray-400 border-line-strong" },
  dipindah: { label: "Dipindah", cls: "bg-panel-raised text-gray-400 border-line-strong" },
  masuk: { label: "Masuk (off pengganti)", cls: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" },
};

const SWAP: Record<SwapStatus, { label: string; cls: string }> = {
  menunggu_rekan: { label: "Menunggu rekan", cls: "bg-amber-500/10 text-amber-300 border-amber-500/30" },
  menunggu_atasan: { label: "Menunggu persetujuan", cls: "bg-cyan-500/10 text-cyan-300 border-cyan-500/30" },
  disetujui: { label: "Disetujui", cls: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" },
  ditolak: { label: "Ditolak", cls: "bg-rose-500/10 text-rose-300 border-rose-500/30" },
  dibatalkan: { label: "Dibatalkan", cls: "bg-panel-raised text-gray-400 border-line-strong" },
};

const shortDate = (ymd: string) => (/^\d{4}-\d{2}-\d{2}$/.test(ymd) ? formatDateLong(ymd) : ymd);

export function DayOffManager({ data, today }: { data: PageData; today: string }) {
  if (!data.ready) {
    return (
      <div role="alert" className="rounded-2xl border border-amber-500/40 bg-amber-950/30 p-4 text-xs text-amber-200 flex gap-3">
        <Icon name="warning" className="text-[20px] text-amber-400 flex-shrink-0" />
        <p>
          Fitur libur belum aktif. Jalankan <code className="font-mono">supabase/migrations/20261101000000_day_off.sql</code> di SQL Editor Supabase.
        </p>
      </div>
    );
  }
  return <View data={data} today={today} />;
}

function View({ data, today }: { data: Extract<PageData, { ready: true }>; today: string }) {
  const router = useRouter();
  const isAdmin = data.role === "admin";
  const [view, setView] = useState<View>("aktif");
  const [branch, setBranch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, start] = useTransition();
  const clearToast = useCallback(() => setToast(null), []);
  useToastTimer(toast, clearToast);

  const { items, swaps } = data;
  const branches = [...new Set(items.map((i) => i.branchCode))].sort();
  const q = query.trim().toLowerCase();
  const filtered = items
    .filter((i) =>
      view === "menunggu"
        ? i.status === "diajukan"
        : view === "aktif"
          ? i.offDate >= today && (i.status === "diajukan" || i.status === "disetujui")
          : view === "riwayat"
            ? i.offDate < today || !["diajukan", "disetujui"].includes(i.status)
            : true,
    )
    .filter((i) => (!branch || i.branchCode === branch) && (!q || i.name.toLowerCase().includes(q) || i.nik.toLowerCase().includes(q)))
    .sort((a, b) => (view === "riwayat" ? b.offDate.localeCompare(a.offDate) : a.offDate.localeCompare(b.offDate)));
  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * PER_PAGE, current * PER_PAGE);

  const weekEnd = new Date(Date.parse(`${today}T00:00:00Z`) + 6 * 86_400_000).toISOString().slice(0, 10);
  const stats = [
    { label: "Menunggu persetujuan", value: items.filter((i) => i.status === "diajukan").length, tone: "text-amber-300" },
    { label: "Libur hari ini", value: items.filter((i) => i.offDate === today && i.status === "disetujui").length, tone: "text-sky-300" },
    { label: "Libur 7 hari ke depan", value: items.filter((i) => i.offDate >= today && i.offDate <= weekEnd && i.status === "disetujui").length, tone: "text-ink" },
    { label: "Tukar off menunggu", value: swaps.filter((s) => s.status === "menunggu_rekan" || s.status === "menunggu_atasan").length, tone: "text-cyan-300" },
  ];

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string) =>
    start(async () => {
      const res = await fn();
      setToast(res.ok ? { text: success, error: false } : { text: res.error, error: true });
      if (res.ok) router.refresh();
    });

  const decide = async (i: DayOffItem, approve: boolean) => {
    if (!approve) {
      const ok = await confirmDialog({ title: `Tolak libur ${i.name}?`, message: shortDate(i.offDate), confirmLabel: "Tolak", tone: "danger" });
      if (!ok) return;
    }
    run(() => decideDayOff(i.id, approve, ""), approve ? `Libur ${i.name} disetujui.` : `Libur ${i.name} ditolak.`);
  };

  return (
    <>
      <section aria-label="Ringkasan libur" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-panel border border-line rounded-2xl p-4">
            <div className="text-[11px] text-gray-400">{s.label}</div>
            <div className={`text-2xl font-bold mt-1 tabular-nums ${s.tone}`}>{s.value}</div>
          </div>
        ))}
      </section>

      <section aria-labelledby="libur-title" className="bg-panel border border-line rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-line flex flex-col gap-3">
          <div>
            <h2 id="libur-title" className="text-sm font-bold text-ink flex items-center gap-2">
              Jadwal & Pengajuan Libur
              <span className="text-[11px] font-mono font-normal text-cyan-300">{filtered.length} libur</span>
            </h2>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Diajukan dari app HP; disetujui SPV cabangnya, Office, atau admin.{" "}
              {isAdmin ? "Admin bisa memproses di sini." : "Mode lihat saja."} Karyawan tetap bisa check in di hari liburnya dan mendapat off pengganti.
            </p>
          </div>
          <div className="flex flex-col md:flex-row md:items-center gap-2 text-xs">
            <div className="flex items-center gap-1 bg-panel-inset p-1 rounded-xl border border-line self-start" role="group" aria-label="Tampilan">
              {(
                [
                  ["aktif", "Akan datang"],
                  ["menunggu", "Menunggu"],
                  ["riwayat", "Riwayat"],
                  ["semua", "Semua"],
                ] as [View, string][]
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => (setView(v), setPage(1))}
                  className={`px-2.5 py-1 rounded-lg transition ${view === v ? "bg-cyan-500/15 text-cyan-300 font-semibold" : "text-gray-400 hover:text-gray-200"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <select value={branch} onChange={(e) => (setBranch(e.target.value), setPage(1))} aria-label="Filter cabang" className={`${filterCls} py-2 px-3`}>
              <option value="">Semua cabang</option>
              {branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            <div className="relative md:w-56">
              <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-gray-500 pointer-events-none" />
              <input
                value={query}
                onChange={(e) => (setQuery(e.target.value), setPage(1))}
                placeholder="Cari nama atau NIK..."
                aria-label="Cari karyawan"
                className={`${filterCls} w-full pl-9 pr-3 py-2 placeholder-gray-500`}
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-gray-400 border-b border-line">
                <th scope="col" className="py-3 px-5 font-semibold">Tanggal Libur</th>
                <th scope="col" className="py-3 px-4 font-semibold">Karyawan</th>
                <th scope="col" className="py-3 px-4 font-semibold hidden md:table-cell">Jenis</th>
                <th scope="col" className="py-3 px-4 font-semibold">Status</th>
                {isAdmin && <th scope="col" className="py-3 px-5 font-semibold text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visible.map((i) => (
                <tr key={i.id} className={`hover:bg-panel-raised/40 ${i.offDate === today ? "bg-sky-500/5" : ""}`}>
                  <td className="py-3 px-5 whitespace-nowrap">
                    <div className="text-gray-100 font-medium">{shortDate(i.offDate)}</div>
                    {i.offDate === today && <div className="text-[10px] text-sky-300">hari ini</div>}
                  </td>
                  <td className="py-3 px-4">
                    <div className="text-gray-100 font-medium">{i.name}</div>
                    <div className="text-[10px] text-gray-500 font-mono">
                      {i.nik} · {i.branchCode}
                    </div>
                    {i.note && <div className="text-[10px] text-gray-400 truncate max-w-[260px]">{i.note}</div>}
                  </td>
                  <td className="py-3 px-4 text-gray-300 hidden md:table-cell">
                    {i.movedFrom ? (
                      <span>
                        Pindah dari <span className="text-gray-100">{shortDate(i.movedFrom)}</span>
                      </span>
                    ) : i.kind === "pengganti" ? (
                      "Off pengganti"
                    ) : (
                      "Jatah libur"
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`inline-block px-2 py-0.5 rounded-full border text-[11px] font-semibold ${STATUS[i.status].cls}`}>{STATUS[i.status].label}</span>
                    {i.decisionNote && <div className="text-[10px] text-gray-500 mt-0.5">{i.decisionNote}</div>}
                  </td>
                  {isAdmin && (
                    <td className="py-3 px-5 text-right whitespace-nowrap">
                      {i.status === "diajukan" && (
                        <div className="inline-flex gap-1.5">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => decide(i, true)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 text-[11px] disabled:opacity-50"
                          >
                            <Icon name="check" className="text-[14px]" />
                            Setujui
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => decide(i, false)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-500/40 text-rose-300 hover:bg-rose-500/10 text-[11px] disabled:opacity-50"
                          >
                            <Icon name="close" className="text-[14px]" />
                            Tolak
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 5 : 4} className="py-10 text-center text-gray-400">
                    Tidak ada libur pada tampilan ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > PER_PAGE && (
          <div className="px-5 py-3 border-t border-line flex justify-end">
            <Pagination page={current} pages={pages} onPage={setPage} />
          </div>
        )}
      </section>

      <section aria-labelledby="swap-title" className="bg-panel border border-line rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-line">
          <h2 id="swap-title" className="text-sm font-bold text-ink flex items-center gap-2">
            <Icon name="sync_alt" className="text-[18px] text-cyan-300" />
            Tukar Off dengan Rekan
          </h2>
          <p className="text-[11px] text-gray-400 mt-0.5">Dua karyawan satu cabang bertukar tanggal libur. Rekan konfirmasi dulu di app, lalu atasan menyetujui.</p>
        </div>
        {swaps.length === 0 ? (
          <p className="px-5 py-8 text-center text-xs text-gray-400">Belum ada pengajuan tukar off.</p>
        ) : (
          <ul className="divide-y divide-line">
            {swaps.slice(0, 30).map((s) => (
              <li key={s.id} className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <div className="text-gray-100">
                    <span className="font-semibold">{s.requester}</span> ({shortDate(s.requesterDate)}) <Icon name="swap_horiz" className="text-[14px] align-middle text-gray-500" />{" "}
                    <span className="font-semibold">{s.partner}</span> ({shortDate(s.partnerDate)})
                  </div>
                  <div className="text-[10px] text-gray-500">
                    {s.branchCode}
                    {s.note ? ` · ${s.note}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`px-2 py-0.5 rounded-full border text-[11px] font-semibold ${SWAP[s.status].cls}`}>{SWAP[s.status].label}</span>
                  {isAdmin && s.status === "menunggu_atasan" && (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => run(() => decideSwap(s.id, true), "Tukar off disetujui.")}
                        className="px-2.5 py-1 rounded-lg border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 text-[11px] disabled:opacity-50"
                      >
                        Setujui
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          if (await confirmDialog({ title: "Tolak tukar off?", message: `${s.requester} ↔ ${s.partner}`, confirmLabel: "Tolak", tone: "danger" }))
                            run(() => decideSwap(s.id, false), "Tukar off ditolak.");
                        }}
                        className="px-2.5 py-1 rounded-lg border border-rose-500/40 text-rose-300 hover:bg-rose-500/10 text-[11px] disabled:opacity-50"
                      >
                        Tolak
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Toast toast={toast} />
    </>
  );
}
