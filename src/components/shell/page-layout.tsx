import Link from "next/link";

/**
 * Penempatan grid untuk isi halaman di dalam AppShell.
 * Layout (src/app/(app)/layout.tsx) memakai grid:
 *   desktop: [topbar span 2] / [page header span 2] / [sidebar | konten]
 *   mobile : topbar / sidebar horizontal / page header / konten
 * Setiap halaman cukup merender <PageHeader> lalu <PageBody>.
 */

export function PageHeader({
  crumb,
  current,
  title,
  actions,
  below,
}: {
  crumb?: React.ReactNode;
  current: string;
  title: string;
  actions?: React.ReactNode;
  /** Konten di bawah judul, mis. <UnderlineTabs>. */
  below?: React.ReactNode;
}) {
  return (
    <div className="md:row-start-2 md:col-start-2 flex flex-col min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-gray-400">
            {/* Crumb yang ternyata kosong (mis. belum ada cabang) disembunyikan beserta pemisahnya */}
            {crumb && (
              <span className="empty:hidden after:content-['>'] after:ml-2 after:text-gray-600">{crumb}</span>
            )}
            <span className="text-cyan-400 font-semibold">{current}</span>
          </div>
          <h1 className="text-xl font-bold text-ink tracking-tight mt-0.5">{title}</h1>
        </div>
        {actions}
      </div>
      {below}
    </div>
  );
}

/**
 * Nav tab bergaris bawah. Garis pemisah digambar dengan inset shadow (bukan border)
 * supaya indikator tab aktif bisa menimpanya meski nav memakai overflow-x-auto.
 */
export const underlineTabsNavClass =
  "flex items-center gap-6 sm:gap-8 mt-5 text-sm overflow-x-auto shadow-[inset_0_-1px_0_var(--color-line)]";

/** Kelas satu tab: indikator 2px membulat menimpa garis pemisah; glow tipis hanya di dark mode. */
export function underlineTabClass(active: boolean) {
  return `relative pb-3 whitespace-nowrap transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors ${
    active
      ? "text-brand-ink font-semibold after:bg-brand after:shadow-[0_0_8px_rgba(0,210,255,0.55)] light:after:shadow-none"
      : "text-gray-400 hover:text-gray-200 font-medium after:bg-transparent hover:after:bg-line-strong"
  }`;
}

/** Tab bergaris bawah (gaya halaman Absensi: Daftar Karyawan / Absensi Harian / Rekap Bulanan). */
export function UnderlineTabs({ items }: { items: { label: string; href: string; active?: boolean }[] }) {
  return (
    <nav
      aria-label="Menu absensi"
      className={underlineTabsNavClass}
    >
      {items.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={underlineTabClass(!!t.active)}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function PageBody({ children }: { children: React.ReactNode }) {
  return (
    <main className="md:row-start-3 md:col-start-2 flex flex-col gap-7 min-w-0">{children}</main>
  );
}

/** Tab navigasi di kanan page header (gaya "Overview Hub"). */
export function PageTabs({ items }: { items: { label: string; href: string; active?: boolean }[] }) {
  return (
    <nav
      aria-label="Tab halaman"
      className="flex items-center gap-1.5 bg-panel p-1 rounded-2xl border border-line-strong self-start sm:self-auto"
    >
      {items.map((t) =>
        t.active ? (
          <span
            key={t.href}
            aria-current="page"
            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 shadow-sm"
          >
            {t.label}
          </span>
        ) : (
          <Link
            key={t.href}
            href={t.href}
            className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-gray-400 hover:text-gray-200 transition"
          >
            {t.label}
          </Link>
        ),
      )}
    </nav>
  );
}
