"use client";

import { LazyMotion, MotionConfig, domAnimation } from "motion/react";

/**
 * Pengaturan animasi bersama (Motion).
 * - LazyMotion + domAnimation: hanya fitur animasi dasar yang dimuat (bundle kecil).
 *   `strict` memastikan komponen memakai `m.*`, bukan `motion.*` yang memuat semuanya.
 * - reducedMotion="user": animasi dimatikan bila pengguna memilih "kurangi animasi" di perangkatnya.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user" transition={{ duration: 0.18, ease: EASE_OUT }}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}

/** Kurva "ease out" yang halus — dipakai semua animasi supaya terasa seragam. */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** Latar gelap pop up: muncul / hilang memudar. */
export const FADE = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.16 },
} as const;

/** Kotak pop up (modal, penampil foto): memudar + sedikit membesar dari bawah. */
export const POP = {
  initial: { opacity: 0, scale: 0.96, y: 10 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.97, y: 6, transition: { duration: 0.12 } },
  transition: { duration: 0.2, ease: EASE_OUT },
} as const;

/** Menu dropdown: turun sedikit sambil memudar, dari tepi atas. */
export const DROP = {
  initial: { opacity: 0, y: -6, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.1 } },
  transition: { duration: 0.16, ease: EASE_OUT },
  style: { transformOrigin: "top" },
} as const;

/** Notifikasi toast: naik dari bawah. */
export const TOAST = {
  initial: { opacity: 0, y: 16, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 10, transition: { duration: 0.14 } },
  transition: { duration: 0.22, ease: EASE_OUT },
} as const;
