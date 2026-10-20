"use client";

import { useRef } from "react";
import { Icon } from "@/components/icon";

/** Buka kalender native; fallback fokus untuk browser tanpa showPicker(). */
export function openDatePicker(input: HTMLInputElement | null) {
  try {
    input?.showPicker();
  } catch {
    input?.focus();
  }
}

/**
 * Input tanggal dengan ikon kalender yang selalu terlihat (dark & light mode).
 * Klik di mana pun pada field membuka kalender. `className` = kelas kotak field.
 */
export function DateInput({
  className = "",
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <span className="relative block">
      <input
        {...props}
        ref={ref}
        type="date"
        onClick={(e) => {
          props.onClick?.(e);
          openDatePicker(ref.current);
        }}
        className={`${className} pr-9 cursor-pointer [color-scheme:dark] light:[color-scheme:light] [&::-webkit-calendar-picker-indicator]:hidden`}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={props.disabled}
        onClick={() => openDatePicker(ref.current)}
        aria-label="Pilih tanggal dari kalender"
        className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-gray-400 hover:text-brand-ink transition-colors"
      >
        <Icon name="calendar_month" className="text-[17px]" />
      </button>
    </span>
  );
}
