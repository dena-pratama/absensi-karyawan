"use client";

import { useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { logout } from "@/app/login/actions";
import { DROP } from "@/components/motion";
import { useDismiss } from "@/components/use-dismiss";

/** Menu profil di topbar: nama, username/email, tombol Keluar. */
export function UserMenu({ user }: { user: { name: string; email: string; initials: string } }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, ref, () => setOpen(false));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 pl-1 cursor-pointer bg-panel border border-line-strong rounded-full py-1 px-2 hover:border-cyan-500/40 transition"
      >
        <span className="w-7 h-7 rounded-full overflow-hidden bg-gradient-to-tr from-cyan-400 to-indigo-500 p-[1.5px] flex-shrink-0">
          <span className="w-full h-full rounded-full bg-gray-900 flex items-center justify-center font-bold text-[11px] text-ink">
            {user.initials}
          </span>
        </span>
        <span className="text-xs font-semibold text-ink max-w-[120px] truncate">{user.name}</span>
        <svg
          className={`w-3.5 h-3.5 mr-1 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <m.div
            {...DROP}
            role="menu"
            className="absolute right-0 mt-2 w-56 rounded-xl bg-panel border border-line-strong shadow-2xl p-2 z-50"
          >
            <div className="px-2.5 py-2 border-b border-line mb-1">
              <div className="text-xs font-semibold text-gray-100 truncate">{user.name}</div>
              <div className="text-[10px] text-gray-400 truncate">{user.email}</div>
            </div>
            <form action={logout}>
              <button
                type="submit"
                role="menuitem"
                className="w-full text-left px-2.5 py-2 rounded-lg text-xs text-gray-300 hover:text-rose-400 hover:bg-panel-raised transition"
              >
                Keluar
              </button>
            </form>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
