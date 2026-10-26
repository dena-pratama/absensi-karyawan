"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, m } from "motion/react";
import { Icon } from "@/components/icon";
import { DROP } from "@/components/motion";
import { BodyPortal } from "@/components/popup-overlay";
import { useAnchored } from "@/components/use-anchored";
import { useDismiss } from "@/components/use-dismiss";
import { getNotifications, type AppNotification, type NotificationKind } from "@/lib/actions/notifications";

/** Diperbarui tiap 60 detik selama tab terlihat. */
const POLL_MS = 60_000;
const SEEN_KEY = "absensi-notif-seen";
/** Item yang tampil dulu di panel; "Tampilkan lebih banyak" menambah sebanyak ini. */
const PAGE = 8;

const KIND: Record<NotificationKind, { icon: string; cls: string }> = {
  check_in: { icon: "login", cls: "bg-emerald-500/15 text-emerald-400" },
  check_out: { icon: "logout", cls: "bg-cyan-500/15 text-cyan-400" },
  kasbon: { icon: "payments", cls: "bg-amber-500/15 text-amber-400" },
  backup: { icon: "swap_horiz", cls: "bg-purple-500/15 text-purple-400" },
};

function ago(iso: string) {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "baru saja";
  if (s < 3600) return `${Math.floor(s / 60)} mnt lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  return `${Math.floor(s / 86400)} hari lalu`;
}

const readSeen = () => {
  try {
    return localStorage.getItem(SEEN_KEY) ?? "";
  } catch {
    return "";
  }
};

/**
 * Lonceng notifikasi aktivitas (admin & Office): check in / out, pengajuan kasbon, backup baru.
 * Titik merah = jumlah aktivitas sejak panel terakhir dibuka. Admin bisa klik untuk membuka halaman terkait;
 * Office hanya melihat.
 */
export function NotificationBell() {
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [canOpen, setCanOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seen, setSeen] = useState(readSeen);
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const ref = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const apply = useCallback((res: Awaited<ReturnType<typeof getNotifications>> | null) => {
    if (!res) return setError("Gagal memuat notifikasi.");
    if (!res.ok) return setError(res.error);
    setError(null);
    setItems(res.items);
    setCanOpen(res.canOpen);
  }, []);
  const load = useCallback(() => getNotifications().catch(() => null).then(apply), [apply]);

  useEffect(() => {
    let alive = true;
    const tick = () =>
      getNotifications()
        .catch(() => null)
        .then((res) => alive && apply(res));
    tick();
    const t = setInterval(() => document.visibilityState === "visible" && tick(), POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [apply]);

  const close = () => setOpen(false);
  useDismiss(open, [ref, menuRef], close);
  const pos = useAnchored(open, ref, { height: 440, minWidth: 360, align: "end" });

  const unread = (items ?? []).filter((n) => n.at > seen).length;

  const toggle = () => {
    if (!open) {
      load();
      setShown(PAGE);
      // Tandai sudah dilihat saat panel dibuka (sorotan "baru" tetap tampil selama panel terbuka).
      const latest = items?.[0]?.at;
      if (latest) {
        try {
          localStorage.setItem(SEEN_KEY, latest);
        } catch {}
      }
    } else {
      setSeen(readSeen());
    }
    setOpen(!open);
  };

  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Notifikasi"
        aria-label={unread ? `Notifikasi, ${unread} baru` : "Notifikasi"}
        className={`relative w-9 h-9 flex-shrink-0 rounded-full bg-panel border text-gray-300 hover:text-brand-ink hover:border-cyan-500/50 flex items-center justify-center transition ${
          open ? "border-cyan-400 text-brand-ink" : "border-line-strong"
        }`}
      >
        <Icon name="notifications" className="text-[18px]" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-shell">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      <BodyPortal>
        <AnimatePresence>
          {open && pos && (
            <m.div
              {...DROP}
              ref={menuRef}
              role="dialog"
              aria-label="Notifikasi aktivitas"
              style={pos.style}
              className="z-[70] max-w-[calc(100vw-16px)] rounded-2xl border border-line-strong bg-panel shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="px-4 py-3 border-b border-line flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-ink">Notifikasi</p>
                  <p className="text-[10px] text-gray-400">Aktivitas 3 hari terakhir{canOpen ? "" : " · mode lihat saja"}</p>
                </div>
                <button type="button" onClick={load} aria-label="Muat ulang" className="p-1.5 rounded-lg text-gray-400 hover:text-ink hover:bg-panel-raised">
                  <Icon name="refresh" className="text-[16px]" />
                </button>
              </div>
              <ul className="overflow-y-auto overscroll-contain divide-y divide-line min-h-0">
                {error && <li className="px-4 py-6 text-center text-xs text-amber-300">{error}</li>}
                {!error && items === null && <li className="px-4 py-6 text-center text-xs text-gray-400">Memuat…</li>}
                {!error && items?.length === 0 && <li className="px-4 py-8 text-center text-xs text-gray-400">Belum ada aktivitas.</li>}
                {items?.slice(0, shown).map((n) => {
                  const k = KIND[n.kind];
                  const fresh = n.at > seen;
                  const body = (
                    <>
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${k.cls}`}>
                        <Icon name={k.icon} className="text-[16px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs text-gray-100 font-medium truncate">{n.title}</span>
                        <span className="block text-[10px] text-gray-400 truncate">{n.detail}</span>
                      </span>
                      <span className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className="text-[10px] text-gray-500 whitespace-nowrap">{ago(n.at)}</span>
                        {fresh && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" aria-label="baru" />}
                      </span>
                    </>
                  );
                  const cls = `flex items-center gap-3 px-4 py-2.5 ${fresh ? "bg-cyan-500/5" : ""}`;
                  return (
                    <li key={n.id}>
                      {canOpen ? (
                        <Link href={n.href} onClick={close} className={`${cls} hover:bg-panel-raised transition`}>
                          {body}
                        </Link>
                      ) : (
                        <div className={cls}>{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
              <div className="px-3 py-2 border-t border-line flex items-center justify-between gap-2 text-[11px]">
                {items && items.length > shown ? (
                  <button type="button" onClick={() => setShown(shown + PAGE)} className="px-2 py-1 rounded-lg text-gray-300 hover:text-ink hover:bg-panel-raised">
                    Tampilkan lebih banyak ({items.length - shown})
                  </button>
                ) : (
                  <span className="text-gray-500 px-2">{items?.length ? "Semua aktivitas 3 hari ditampilkan" : ""}</span>
                )}
                <Link href="/notifikasi" onClick={close} className="px-2 py-1 rounded-lg text-brand-ink font-semibold hover:bg-panel-raised whitespace-nowrap">
                  Lihat semua
                </Link>
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </BodyPortal>
    </>
  );
}
