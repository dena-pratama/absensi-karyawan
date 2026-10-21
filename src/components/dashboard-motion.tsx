"use client";

import { useEffect, useState } from "react";
import { animate, m, useReducedMotion } from "motion/react";
import { EASE_OUT } from "@/components/motion";

/**
 * Angka yang naik bertahap dari 0 ke `value` saat tampil (mis. persentase kehadiran).
 * Pembaca layar langsung mendapat angka akhirnya; "kurangi animasi" → langsung angka akhir.
 */
export function CountUp({ value, suffix = "%", delay = 0 }: { value: number; suffix?: string; delay?: number }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const controls = animate(0, value, {
      duration: 0.9,
      delay,
      ease: EASE_OUT,
      onUpdate: (v) => setShown(Math.round(v)),
    });
    return () => controls.stop();
  }, [value, delay, reduce]);

  return (
    <>
      <span aria-hidden="true">
        {reduce ? value : shown}
        {suffix}
      </span>
      <span className="sr-only">
        {value}
        {suffix}
      </span>
    </>
  );
}

/** Isi progress bar yang memanjang dari 0 ke `percent` (berurutan lewat `index`). */
export function GrowBar({ percent, index = 0, className = "" }: { percent: number; index?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <m.div
      className={className}
      initial={reduce ? false : { width: 0 }}
      animate={{ width: `${percent}%` }}
      transition={{ duration: 0.7, delay: 0.1 + index * 0.06, ease: EASE_OUT }}
    />
  );
}
