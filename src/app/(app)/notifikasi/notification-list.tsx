"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icon";
import type { AppNotification, NotificationKind, NotificationResult } from "@/lib/actions/notifications";
import { filterCls } from "../pengaturan/_components/ui";

const KIND: Record<NotificationKind, { label: string; icon: string; cls: string }> = {
  check_in: { label: "Check in", icon: "login", cls: "bg-emerald-500/15 text-emerald-400" },
  check_out: { label: "Check out", icon: "logout", cls: "bg-cyan-500/15 text-cyan-400" },
  kasbon: { label: "Kasbon", icon: "payments", cls: "bg-amber-500/15 text-amber-400" },
  backup: { label: "Backup", icon: "swap_horiz", cls: "bg-purple-500/15 text-purple-400" },
  libur: { label: "Libur", icon: "beach_access", cls: "bg-sky-500/15 text-sky-400" },
};
const KINDS = Object.keys(KIND) as NotificationKind[];
const PAGE = 30;

const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date(iso));
const dayLabel = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
const clock = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)).replace(".", ":");

/** Halaman Notifikasi: semua aktivitas dikelompokkan per hari, filter jenis & cari, muat lebih banyak. */
export function NotificationList({ result, days, ranges }: { result: NotificationResult; days: number; ranges: number[] }) {
  const [kind, setKind] = useState<NotificationKind | "">("");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);

  if (!result.ok) {
    return <p className="rounded-2xl border border-amber-500/40 bg-amber-950/30 p-4 text-xs text-amber-200">{result.error}</p>;
  }
  const { items, canOpen } = result;
  const q = query.trim().toLowerCase();
  const filtered = items.filter((n) => (!kind || n.kind === kind) && (!q || `${n.title} ${n.detail}`.toLowerCase().includes(q)));
  const visible = filtered.slice(0, shown);

  const groups: { key: string; label: string; list: AppNotification[] }[] = [];
  for (const n of visible) {
    const key = dayKey(n.at);
    const g = groups.at(-1);
    if (g?.key === key) g.list.push(n);
    else groups.push({ key, label: dayLabel(n.at), list: [n] });
  }
  const count = (k: NotificationKind) => items.filter((n) => n.kind === k).length;

  return (
    <>
      <section aria-label="Ringkasan notifikasi" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => (setKind(kind === k ? "" : k), setShown(PAGE))}
            aria-pressed={kind === k}
            className={`text-left bg-panel border rounded-2xl p-4 flex items-center gap-3 transition ${kind === k ? "border-cyan-400/70" : "border-line hover:border-line-strong"}`}
          >
            <span className={`w-10 h-10 rounded-full flex items-center justify-center ${KIND[k].cls}`}>
              <Icon name={KIND[k].icon} className="text-[20px]" />
            </span>
            <span>
              <span className="block text-[11px] text-gray-400">{KIND[k].label}</span>
              <span className="block text-xl font-bold text-ink tabular-nums">{count(k)}</span>
            </span>
          </button>
        ))}
      </section>

      <section aria-labelledby="notif-title" className="bg-panel border border-line rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-line flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 id="notif-title" className="text-sm font-bold text-ink flex items-center gap-2">
              Semua Aktivitas
              <span className="text-[11px] font-mono font-normal text-cyan-300">{filtered.length} aktivitas</span>
            </h2>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {days} hari terakhir{canOpen ? " · klik aktivitas untuk membuka halamannya" : " · mode lihat saja"}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 text-xs">
            <div className="relative sm:w-56">
              <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-gray-500 pointer-events-none" />
              <input
                value={query}
                onChange={(e) => (setQuery(e.target.value), setShown(PAGE))}
                placeholder="Cari nama / cabang..."
                aria-label="Cari aktivitas"
                className={`${filterCls} w-full pl-9 pr-3 py-2 placeholder-gray-500`}
              />
            </div>
            <div className="flex items-center gap-1 bg-panel-inset p-1 rounded-xl border border-line" role="group" aria-label="Rentang">
              {ranges.map((d) => (
                <Link
                  key={d}
                  href={`/notifikasi?hari=${d}`}
                  aria-current={d === days ? "true" : undefined}
                  className={`px-2.5 py-1 rounded-lg transition ${d === days ? "bg-cyan-500/15 text-cyan-300 font-semibold" : "text-gray-400 hover:text-gray-200"}`}
                >
                  {d} hari
                </Link>
              ))}
            </div>
          </div>
        </div>

        {groups.length === 0 ? (
          <p className="px-5 py-12 text-center text-xs text-gray-400">Tidak ada aktivitas{kind || q ? " yang cocok dengan filter" : ""}.</p>
        ) : (
          groups.map((g) => (
            <div key={g.key}>
              <div className="px-5 py-2 bg-panel-inset/60 border-b border-line text-[11px] font-semibold text-gray-300 sticky top-0">
                {g.label} <span className="font-normal text-gray-500">· {g.list.length}</span>
              </div>
              <ul className="divide-y divide-line">
                {g.list.map((n) => {
                  const k = KIND[n.kind];
                  const body = (
                    <>
                      <span className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${k.cls}`}>
                        <Icon name={k.icon} className="text-[18px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs text-gray-100 font-medium">{n.title}</span>
                        <span className="block text-[11px] text-gray-400">{n.detail}</span>
                      </span>
                      <span className="text-[11px] text-gray-500 font-mono flex-shrink-0">{clock(n.at)}</span>
                      {canOpen && <Icon name="chevron_right" className="text-[18px] text-gray-500 flex-shrink-0" />}
                    </>
                  );
                  const cls = "flex items-center gap-3 px-5 py-3";
                  return (
                    <li key={n.id}>
                      {canOpen ? (
                        <Link href={n.href} className={`${cls} hover:bg-panel-raised/50 transition`}>
                          {body}
                        </Link>
                      ) : (
                        <div className={cls}>{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}

        {filtered.length > shown && (
          <div className="px-5 py-3 border-t border-line text-center">
            <button
              type="button"
              onClick={() => setShown(shown + PAGE)}
              className="px-4 py-2 rounded-lg border border-line-strong text-xs text-gray-300 hover:text-brand-ink hover:border-cyan-500/50 transition"
            >
              Tampilkan lebih banyak ({filtered.length - shown} lagi)
            </button>
          </div>
        )}
      </section>
    </>
  );
}
