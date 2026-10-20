import type { Metadata } from "next";
import { Icon } from "@/components/icon";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Masuk — Absensi Ekspedisi",
};

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col justify-between">
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

      <main className="relative z-10 flex-1 flex flex-col justify-center items-center w-full max-w-[1240px] mx-auto px-margin py-space-xl">
        <div className="relative flex flex-col w-full items-center justify-center py-space-sm sm:py-space-md">
          <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-[520px] max-w-full h-[360px] bg-primary-container/10 blur-[110px] rounded-full pointer-events-none -z-10" />

          <div className="w-full max-w-[460px] bg-surface-shell/90 backdrop-blur-2xl rounded-xl shadow-2xl p-6 sm:p-8 flex flex-col relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary-container to-transparent" />

            <div className="flex flex-col items-center text-center mb-space-lg">
              <div className="relative mb-space-sm group">
                <div className="w-12 h-12 rounded-lg bg-surface-input flex items-center justify-center text-primary-container shadow-[0_0_20px_rgba(0,210,255,0.22)] transition-all duration-300 group-hover:scale-105">
                  <Icon name="terminal" className="text-[26px]" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-status-present rounded-full ring-2 ring-surface-shell" />
              </div>
              <div className="flex items-center gap-space-xs mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-primary-container animate-ping" />
                <span className="text-caption text-primary uppercase tracking-widest font-semibold">
                  Sync Status
                </span>
              </div>
              <h1 className="text-headline-md text-on-surface tracking-tight">Masuk ke Sistem Presensi</h1>
              <p className="text-body-sm text-on-surface-variant mt-0.5">Portal Operasional Absensi Ekspedisi</p>
            </div>

            <LoginForm />
          </div>
        </div>
      </main>

      <footer className="relative z-10 w-full bg-surface-shell/60 backdrop-blur-md shadow-[0_-1px_8px_rgba(0,0,0,0.3)]" />
    </div>
  );
}
