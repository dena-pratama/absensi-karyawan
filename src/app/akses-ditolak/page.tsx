import type { Metadata } from "next";
import { logout } from "@/app/login/actions";
import { Icon } from "@/components/icon";
import { ThemeToggle } from "@/components/shell/theme-toggle";

export const metadata: Metadata = { title: "Akses Ditolak" };

/** Akun login yang belum diberi role (tidak ada di app_user) diarahkan ke sini oleh proxy. */
export default function AksesDitolakPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_20%,#00d2ff12,transparent_65%)] z-0" />

      <header className="relative z-10 w-full bg-surface-shell/80 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.4)]">
        <div className="h-16 max-w-[1240px] mx-auto px-margin flex items-center justify-between">
          <div className="flex items-center gap-space-md">
            <div className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center text-primary-container shadow-[0_0_15px_rgba(0,210,255,0.25)]">
              <Icon name="hub" className="text-[20px]" />
            </div>
            <span className="text-headline-sm tracking-tight text-on-surface">Absensi Ekspedisi</span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center px-margin py-space-xl">
        <div className="w-full max-w-[460px] bg-surface-shell/90 backdrop-blur-2xl rounded-xl shadow-2xl p-6 sm:p-8 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-amber-400 to-transparent" />
          <div className="w-12 h-12 mx-auto mb-4 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
            <Icon name="lock_person" className="text-[26px]" />
          </div>
          <h1 className="text-headline-md text-on-surface tracking-tight">Akun belum diberi akses</h1>
          <p className="text-body-sm text-on-surface-variant mt-2">
            Akun kamu sudah terdaftar, tapi belum punya role. Minta admin mengatur hak akses di{" "}
            <span className="font-semibold text-on-surface">Pengaturan → Pengguna &amp; Akses</span>, lalu masuk kembali.
          </p>
          <form action={logout} className="mt-6">
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-container text-on-primary-fixed text-xs font-bold hover:opacity-90 transition"
            >
              <Icon name="logout" className="text-[16px]" />
              Keluar &amp; masuk dengan akun lain
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
