"use client";

import { useActionState, useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { login, type LoginState } from "./actions";

const initialState: LoginState = { error: null, login: "" };

const inputClass =
  "w-full bg-surface-input text-on-surface placeholder:text-outline-variant text-body-sm px-3.5 py-2.5 rounded-lg " +
  "focus:outline-none focus:bg-surface-container-high focus:ring-1 focus:ring-primary-container transition-all " +
  "shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);
  const [showPassword, setShowPassword] = useState(false);
  // Toast tampil untuk setiap hasil login yang error, lalu hilang setelah 3,2 detik.
  const [dismissed, setDismissed] = useState<LoginState | null>(null);
  const toast = state.error && dismissed !== state ? state.error : null;

  useEffect(() => {
    if (!state.error) return;
    const t = setTimeout(() => setDismissed(state), 3200);
    return () => clearTimeout(t);
  }, [state]);

  return (
    <>
      <form action={formAction} className="flex flex-col gap-space-md">
        {/* Username atau email */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="login" className="text-label-md text-on-surface flex items-center gap-1.5">
            <Icon name="badge" className="text-[15px] text-primary" />
            Username / Email
          </label>
          <div className="relative flex items-center">
            <input
              id="login"
              name="login"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="username atau email"
              defaultValue={state.login}
              required
              className={`${inputClass} pr-10`}
            />
            <Icon
              name="fingerprint"
              className="absolute right-3 text-[18px] text-outline-variant pointer-events-none"
            />
          </div>
        </div>

        {/* Kata sandi */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-label-md text-on-surface flex items-center gap-1.5">
            <Icon name="key" className="text-[15px] text-primary" />
            Kata Sandi
          </label>
          <div className="relative flex items-center">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••••••"
              required
              className={`${inputClass} pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
              className="absolute right-2.5 p-1 text-outline-variant hover:text-on-surface transition-colors flex items-center justify-center rounded focus:outline-none focus-visible:ring-1 focus-visible:ring-primary-container"
            >
              <Icon name={showPassword ? "visibility_off" : "visibility"} className="text-[18px]" />
            </button>
          </div>
        </div>

        {/* Ingat sesi */}
        <div className="flex items-center justify-between pt-1">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              name="remember"
              defaultChecked
              className="w-3.5 h-3.5 rounded bg-surface-input accent-primary-container cursor-pointer"
            />
            <span className="text-label-sm text-on-surface-variant">Ingat sesi perangkat</span>
          </label>
        </div>

        {/* CTA */}
        <button
          type="submit"
          disabled={pending}
          className="w-full mt-2 py-3 px-4 rounded-lg bg-primary-container text-on-primary-fixed text-headline-sm tracking-wide shadow-[0_0_20px_rgba(0,210,255,0.32)] hover:shadow-[0_0_28px_rgba(0,210,255,0.5)] hover:brightness-105 active:scale-[0.99] disabled:opacity-80 disabled:cursor-wait transition-all flex items-center justify-center gap-2"
        >
          {pending ? (
            <>
              <span className="w-4 h-4 rounded-full border-2 border-on-primary-fixed border-t-transparent animate-spin inline-block" />
              <span>Memverifikasi...</span>
            </>
          ) : (
            <>
              <span>Masuk ke Sistem</span>
              <Icon name="arrow_forward" className="text-[18px]" />
            </>
          )}
        </button>
      </form>

      {/* Toast */}
      <div
        role="status"
        aria-live="polite"
        className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-lg bg-surface-container-high text-on-surface shadow-2xl flex items-center gap-2.5 transition-all duration-300 z-50 ${
          toast ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"
        }`}
      >
        <Icon name="error" className="text-[18px] text-error" />
        <span className="text-body-sm">{toast}</span>
      </div>
    </>
  );
}
