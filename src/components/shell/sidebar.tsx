"use client";

import Link from "next/link";
import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { logout } from "@/app/login/actions";

// Ikon mengikuti desain dashboard (heroicons outline).
const ICONS = {
  dashboard:
    "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  absensi:
    "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  laporan:
    "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  kasbon:
    "M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z",
  backup:
    "M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4",
  libur:
    "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  notif:
    "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9",
  logout:
    "M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1",
};

const SETTINGS_PATHS = [
  "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z",
  "M15 12a3 3 0 11-6 0 3 3 0 016 0z",
];

function Svg({ paths, className = "w-5 h-5" }: { paths: string[]; className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      {paths.map((d) => (
        <path key={d} d={d} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
      ))}
    </svg>
  );
}

type NavItem = { href: string; label: string; paths: string[]; match: (p: string) => boolean };

const MAIN_NAV: NavItem[] = [
  { href: "/", label: "Dashboard", paths: [ICONS.dashboard], match: (p) => p === "/" },
  { href: "/absensi", label: "Absensi & Karyawan", paths: [ICONS.absensi], match: (p) => p.startsWith("/absensi") },
  { href: "/backup", label: "Backup Karyawan", paths: [ICONS.backup], match: (p) => p.startsWith("/backup") },
  { href: "/libur", label: "Libur Karyawan", paths: [ICONS.libur], match: (p) => p.startsWith("/libur") },
  { href: "/laporan", label: "Laporan", paths: [ICONS.laporan], match: (p) => p.startsWith("/laporan") },
  { href: "/kasbon", label: "Kasbon", paths: [ICONS.kasbon], match: (p) => p.startsWith("/kasbon") },
];

/** Menu untuk akun hanya-lihat (sama dengan VIEWER_PATHS di proxy): tanpa Laporan Absensi. */
const VIEWER_NAV = MAIN_NAV.filter((i) => i.href !== "/laporan" && i.href !== "/backup" && i.href !== "/libur");
/** Office (hanya-lihat) juga melihat jadwal libur. */
const OFFICE_NAV = MAIN_NAV.filter((i) => i.href !== "/laporan" && i.href !== "/backup");

const SETTINGS_NAV: NavItem = {
  href: "/pengaturan",
  label: "Pengaturan",
  paths: SETTINGS_PATHS,
  match: (p) => p.startsWith("/pengaturan"),
};

const NOTIF_NAV: NavItem = {
  href: "/notifikasi",
  label: "Notifikasi",
  paths: [ICONS.notif],
  match: (p) => p.startsWith("/notifikasi"),
};

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = item.match(pathname);
  return (
    <Link
      href={item.href}
      aria-label={item.label}
      title={item.label}
      aria-current={active ? "page" : undefined}
      className={`relative flex flex-col items-center group ${active ? "text-brand-ink" : "text-gray-400"}`}
    >
      <span
        className={`w-10 h-10 rounded-2xl flex items-center justify-center transition ${
          active
            ? "bg-brand/10 shadow-[0_0_12px_rgba(0,210,255,0.25)]"
            : "hover:text-brand-ink hover:bg-panel-raised"
        }`}
      >
        <Svg paths={item.paths} className={active ? "w-5 h-5 stroke-[2.2]" : "w-5 h-5"} />
      </span>
      {active && (
        <span className="absolute -bottom-1.5 md:static w-1.5 h-1.5 bg-brand rounded-full md:mt-1.5 shadow-[0_0_6px_#00d2ff]" />
      )}
    </Link>
  );
}

function SidebarView({ pathname, className, readOnly, notif }: { pathname: string; className: string; readOnly: boolean; notif: boolean }) {
  return (
    <aside
      // Mobile: bilah navigasi tetap di bawah layar. Desktop: kolom kiri, menempel di bawah topbar saat scroll.
      className={`bg-panel border border-line-strong rounded-full shadow-xl flex-shrink-0 flex items-center justify-between
        fixed z-40 inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] flex-row px-6 py-2
        md:static md:z-auto md:w-16 md:flex-col md:py-6 md:px-3 md:self-start md:sticky md:top-7 ${className}`}
    >
      <nav aria-label="Navigasi utama" className="flex flex-row md:flex-col items-center gap-6">
        {(readOnly ? (notif ? OFFICE_NAV : VIEWER_NAV) : MAIN_NAV).map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} />
        ))}
      </nav>
      <div className="flex flex-row md:flex-col items-center gap-6 md:pt-10">
        {!readOnly && <NavLink item={SETTINGS_NAV} pathname={pathname} />}
        {notif && <NavLink item={NOTIF_NAV} pathname={pathname} />}
        <form action={logout}>
          <button
            type="submit"
            aria-label="Keluar"
            title="Keluar"
            className="w-10 h-10 rounded-2xl flex items-center justify-center text-gray-400 hover:text-rose-400 transition"
          >
            <Svg paths={[ICONS.logout]} />
          </button>
        </form>
      </div>
    </aside>
  );
}

function SidebarWithPath({ className, readOnly, notif }: { className: string; readOnly: boolean; notif: boolean }) {
  return <SidebarView pathname={usePathname()} className={className} readOnly={readOnly} notif={notif} />;
}

/** usePathname() butuh Suspense di rute dinamis; fallback = sidebar tanpa state aktif. */
/** readOnly = akun SPV / karyawan: menu Dashboard, Absensi & Kasbon. */
/** notif = halaman Notifikasi (admin & Office), di bawah Pengaturan. */
export function Sidebar({ className = "", readOnly = false, notif = false }: { className?: string; readOnly?: boolean; notif?: boolean }) {
  return (
    <Suspense fallback={<SidebarView pathname="" className={className} readOnly={readOnly} notif={notif} />}>
      <SidebarWithPath className={className} readOnly={readOnly} notif={notif} />
    </Suspense>
  );
}
