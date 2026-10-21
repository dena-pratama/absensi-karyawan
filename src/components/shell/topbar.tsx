import { getShellData } from "@/lib/data/shell";
import { BranchSwitcher } from "./branch-switcher";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

function Brand({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex items-center flex-wrap gap-3">
      <div className="flex items-center gap-2">
        <span className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-teal-300 bg-clip-text text-transparent tracking-wide">
          Absensi Ekspedisi
        </span>
        <span className="text-gray-600 font-light text-xl">|</span>
        <span className="text-gray-400 font-medium text-base">Data Hub</span>
      </div>
      {children}
    </div>
  );
}

const headerClass =
  "flex flex-col md:flex-row items-center justify-between gap-4 pb-4 border-b border-line/60";

/** Skeleton topbar saat data sesi masih dimuat. */
export function TopbarFallback({ className = "" }: { className?: string }) {
  return (
    <header className={`${headerClass} ${className}`}>
      <Brand>
        <span className="w-44 h-8 rounded-full bg-panel-raised border border-line-strong animate-pulse ml-1" />
      </Brand>
      <div className="flex items-center gap-3 w-full md:w-auto justify-end">
        <span className="w-full md:w-64 h-8 rounded-full bg-panel-raised border border-line-strong" />
        <ThemeToggle />
        <span className="w-28 h-9 rounded-full bg-panel border border-line-strong animate-pulse" />
      </div>
    </header>
  );
}

export async function Topbar({ className = "" }: { className?: string }) {
  const { user, branches, activeBranch } = await getShellData();

  return (
    <header className={`${headerClass} ${className}`}>
      <Brand>
        <BranchSwitcher branches={branches} activeId={activeBranch?.id ?? null} />
      </Brand>

      <div className="flex items-center gap-3 w-full md:w-auto justify-end">
        {/* Pencarian staf → Daftar Karyawan */}
        <form action="/absensi/karyawan" role="search" className="relative w-full md:w-64">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-500">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M21 21l-4.35-4.35M16.65 11a5.65 5.65 0 11-11.3 0 5.65 5.65 0 0111.3 0z"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
              />
            </svg>
          </div>
          <input
            type="search"
            name="q"
            aria-label="Cari staf"
            placeholder="Cari staf (nama, NIK)..."
            className="w-full bg-panel-raised text-xs text-gray-200 placeholder-gray-500 rounded-full pl-10 pr-4 py-2 border border-line-strong focus:outline-none focus:border-cyan-400 transition"
          />
        </form>

        <ThemeToggle />

        {/* Profil admin */}
        <UserMenu user={user} />
      </div>
    </header>
  );
}
