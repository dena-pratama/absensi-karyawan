"use client";

import { Icon } from "@/components/icon";
import { THEME_STORAGE_KEY } from "@/lib/theme";

/**
 * Tombol Light/Dark Mode. Ikon dipilih lewat varian CSS `light:` (bukan state),
 * jadi tidak ada mismatch hydration dengan tema yang diset skrip inline.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  function toggle() {
    const root = document.documentElement;
    const next = root.dataset.theme === "light" ? "dark" : "light";
    root.dataset.theme = next;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // localStorage tidak tersedia (mode privat); tema tetap berlaku sampai reload.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title="Ganti tema terang / gelap"
      aria-label="Ganti tema terang / gelap"
      className={`w-9 h-9 flex-shrink-0 rounded-full bg-panel border border-line-strong text-gray-300 hover:text-brand-ink hover:border-cyan-500/50 flex items-center justify-center transition ${className}`}
    >
      {/* Dibungkus: CSS Google Fonts menetapkan display pada ikon, jadi hidden dipasang di pembungkus */}
      <span className="flex light:hidden">
        <Icon name="light_mode" className="text-[18px]" />
      </span>
      <span className="hidden light:flex">
        <Icon name="dark_mode" className="text-[18px]" />
      </span>
    </button>
  );
}
