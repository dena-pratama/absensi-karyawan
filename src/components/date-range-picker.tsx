"use client";

import { useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { Icon } from "@/components/icon";
import { DROP } from "@/components/motion";
import { BodyPortal } from "@/components/popup-overlay";
import { useAnchored } from "@/components/use-anchored";
import { useDismiss } from "@/components/use-dismiss";

/* Tanggal "YYYY-MM-DD" dihitung di UTC supaya tidak bergeser zona waktu. */
const toDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const ymdOf = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (ymd: string, n: number) => {
  const d = toDate(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return ymdOf(d);
};
const monthStart = (ymd: string) => `${ymd.slice(0, 7)}-01`;
const addMonths = (ymd: string, n: number) => {
  const d = toDate(monthStart(ymd));
  d.setUTCMonth(d.getUTCMonth() + n);
  return ymdOf(d);
};
const daysBetween = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86_400_000);

const fmt = (ymd: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", ...opts }).format(toDate(ymd));
export const formatRangeLabel = (from: string, to: string) =>
  from === to
    ? fmt(from, { day: "numeric", month: "short", year: "numeric" })
    : `${fmt(from, { day: "numeric", month: "short", ...(from.slice(0, 4) !== to.slice(0, 4) ? { year: "numeric" } : {}) })} - ${fmt(to, { day: "numeric", month: "short", year: "numeric" })}`;

const WEEKDAYS = ["Sn", "Sl", "Rb", "Km", "Jm", "Sb", "Mg"];

type Range = { from: string; to: string };

function presets(today: string): { label: string; range: Range }[] {
  const thisMonth = monthStart(today);
  const lastMonth = addMonths(today, -1);
  return [
    { label: "Hari ini", range: { from: today, to: today } },
    { label: "Kemarin", range: { from: addDays(today, -1), to: addDays(today, -1) } },
    { label: "7 hari terakhir", range: { from: addDays(today, -6), to: today } },
    { label: "30 hari terakhir", range: { from: addDays(today, -29), to: today } },
    { label: "Bulan ini", range: { from: thisMonth, to: today } },
    { label: "Bulan lalu", range: { from: lastMonth, to: addDays(thisMonth, -1) } },
  ];
}

/**
 * Pemilih rentang tanggal: preset cepat + kalender (klik tanggal awal lalu tanggal akhir,
 * sorotan mengikuti kursor). Tanggal setelah `max` tidak bisa dipilih; rentang dibatasi `maxDays`.
 */
export function DateRangePicker({
  from,
  to,
  max,
  maxDays = 93,
  onApply,
}: {
  from: string;
  to: string;
  max: string;
  maxDays?: number;
  onApply: (range: Range) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<{ from: string; to: string | null }>({ from, to });
  const [hover, setHover] = useState<string | null>(null);
  const [month, setMonth] = useState(monthStart(to));
  const ref = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = () => setOpen(false);
  useDismiss(open, [ref, menuRef], close);
  const pos = useAnchored(open, ref, { height: 420, minWidth: 470 });

  const toggle = () => {
    if (!open) {
      setDraft({ from, to });
      setMonth(monthStart(to));
      setHover(null);
    }
    setOpen(!open);
  };

  const pick = (day: string) => {
    if (draft.to !== null || day < draft.from) return setDraft({ from: day, to: null });
    setDraft({ from: draft.from, to: day });
  };

  const end = draft.to ?? (hover && hover >= draft.from ? hover : draft.from);
  const tooLong = daysBetween(draft.from, end) + 1 > maxDays;
  const apply = (range: Range) => {
    onApply(range);
    close();
  };

  // Grid kalender: minggu dimulai Senin
  const first = toDate(month);
  const lead = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => addDays(month, i))];

  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`flex items-center gap-2 h-8 px-3 rounded-lg border text-[11px] font-semibold whitespace-nowrap transition ${
          open ? "border-cyan-400 text-ink bg-panel-inset" : "border-line-strong text-gray-200 bg-panel-inset hover:border-cyan-500/50"
        }`}
      >
        <Icon name="calendar_month" className="text-[16px] text-brand-ink" />
        {formatRangeLabel(from, to)}
        <Icon name="expand_more" className={`text-[16px] text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <BodyPortal>
        <AnimatePresence>
          {open && pos && (
            <m.div
              {...DROP}
              initial={{ ...DROP.initial, y: pos.up ? 6 : -6 }}
              ref={menuRef}
              role="dialog"
              aria-label="Pilih rentang tanggal"
              style={{ ...pos.style, transformOrigin: pos.up ? "bottom" : "top" }}
              className="z-[70] rounded-2xl border border-line-strong bg-panel shadow-2xl overflow-auto flex flex-col sm:flex-row text-xs"
            >
              {/* Preset */}
              <ul className="flex sm:flex-col gap-1 p-2 sm:w-40 border-b sm:border-b-0 sm:border-r border-line overflow-x-auto">
                {presets(max).map((p) => {
                  const active = p.range.from === draft.from && p.range.to === draft.to;
                  return (
                    <li key={p.label}>
                      <button
                        type="button"
                        onClick={() => apply(p.range)}
                        className={`w-full text-left whitespace-nowrap px-2.5 py-1.5 rounded-lg transition ${
                          active ? "bg-cyan-500/15 text-cyan-300 font-semibold" : "text-gray-300 hover:bg-panel-raised hover:text-ink"
                        }`}
                      >
                        {p.label}
                      </button>
                    </li>
                  );
                })}
              </ul>

              {/* Kalender */}
              <div className="p-3 flex-1 min-w-[18.5rem]">
                <div className="flex items-center justify-between mb-2">
                  <button type="button" onClick={() => setMonth(addMonths(month, -1))} aria-label="Bulan sebelumnya" className="p-1 rounded-lg text-gray-400 hover:text-ink hover:bg-panel-raised">
                    <Icon name="chevron_left" className="text-[18px]" />
                  </button>
                  <span className="font-semibold text-ink capitalize">{fmt(month, { month: "long", year: "numeric" })}</span>
                  <button
                    type="button"
                    onClick={() => setMonth(addMonths(month, 1))}
                    disabled={addMonths(month, 1) > max}
                    aria-label="Bulan berikutnya"
                    className="p-1 rounded-lg text-gray-400 hover:text-ink hover:bg-panel-raised disabled:opacity-30 disabled:pointer-events-none"
                  >
                    <Icon name="chevron_right" className="text-[18px]" />
                  </button>
                </div>
                <div className="grid grid-cols-7 text-center text-[10px] text-gray-500 mb-1">
                  {WEEKDAYS.map((w) => (
                    <span key={w}>{w}</span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-y-1" onMouseLeave={() => setHover(null)}>
                  {cells.map((day, i) => {
                    if (!day) return <span key={`pad-${i}`} />;
                    const disabled = day > max;
                    const isStart = day === draft.from;
                    const isEnd = day === end;
                    const inRange = day > draft.from && day < end;
                    const edge = isStart || isEnd;
                    return (
                      <button
                        key={day}
                        type="button"
                        disabled={disabled}
                        onClick={() => pick(day)}
                        onMouseEnter={() => setHover(day)}
                        className={`relative h-8 text-[11px] tabular-nums transition disabled:text-gray-600 disabled:pointer-events-none ${
                          inRange ? "bg-cyan-500/10 text-cyan-100" : ""
                        } ${isStart && !isEnd ? "rounded-l-lg bg-cyan-500/10" : ""} ${isEnd && !isStart ? "rounded-r-lg bg-cyan-500/10" : ""}`}
                      >
                        <span
                          className={`mx-auto w-8 h-8 flex items-center justify-center rounded-lg ${
                            disabled ? "text-gray-600" : edge ? "bg-cyan-400 text-black font-bold" : day === max ? "ring-1 ring-cyan-500/50 text-gray-200" : "text-gray-200 hover:bg-panel-raised"
                          }`}
                        >
                          {Number(day.slice(8))}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 pt-3 border-t border-line flex items-center justify-between gap-2">
                  <span className={`text-[11px] ${tooLong ? "text-amber-300" : "text-gray-400"}`}>
                    {tooLong
                      ? `Maks. ${maxDays} hari`
                      : draft.to
                        ? `${formatRangeLabel(draft.from, draft.to)} · ${daysBetween(draft.from, draft.to) + 1} hari`
                        : "Pilih tanggal akhir"}
                  </span>
                  <div className="flex gap-1.5">
                    <button type="button" onClick={close} className="px-2.5 py-1.5 rounded-lg border border-line-strong text-gray-300 hover:text-ink">
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={() => apply({ from: draft.from, to: draft.to ?? draft.from })}
                      disabled={tooLong}
                      className="px-3 py-1.5 rounded-lg bg-brand text-black font-semibold hover:bg-brand/90 disabled:opacity-40"
                    >
                      Terapkan
                    </button>
                  </div>
                </div>
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </BodyPortal>
    </>
  );
}
