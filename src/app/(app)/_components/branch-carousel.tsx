"use client";

import { useState, useTransition } from "react";
import { m } from "motion/react";
import { EASE_OUT } from "@/components/motion";
import { openBranchEmployees } from "@/lib/actions/branch";

export type BranchCard = {
  id: string;
  title: string;
  subtitle: string;
  hadir: number;
  total: number;
  percent: number | null;
  avatars: string[];
  more: number;
};

// 3 palet kartu dari desain (ungu, teal, magenta), dipakai bergantian.
const PALETTES = [
  {
    card: "from-[#9b82ec] via-[#a38bf0] to-[#8064dc]",
    title: "text-[#141226]",
    sub: "text-[#322c54]",
    dot: "bg-[#141226]",
    badge: "text-[#241f3d]",
    ring: "ring-purple-300",
    avatar: ["bg-purple-900", "bg-indigo-800", "bg-emerald-700"],
    more: "bg-[#2b254a] text-purple-200",
    btn: "bg-[#24213d]/25 hover:bg-[#24213d]/35 text-[#141226]",
  },
  {
    card: "from-[#02cbb3] via-[#00c5ad] to-[#01a794]",
    title: "text-[#0c312c]",
    sub: "text-[#12423b]",
    dot: "bg-[#0c312c]",
    badge: "text-[#0c312c]",
    ring: "ring-teal-300",
    avatar: ["bg-teal-950", "bg-cyan-900", "bg-slate-800"],
    more: "bg-[#09352e] text-teal-200",
    btn: "bg-[#042823]/25 hover:bg-[#042823]/35 text-[#0c312c]",
  },
  {
    card: "from-[#fc1b6d] via-[#f71162] to-[#de0854]",
    title: "text-[#320211]",
    sub: "text-[#48041a]",
    dot: "bg-[#320211]",
    badge: "text-[#320211]",
    ring: "ring-pink-300",
    avatar: ["bg-pink-950", "bg-rose-900", "bg-red-950"],
    more: "bg-[#3a0616] text-pink-200",
    btn: "bg-[#3b0314]/25 hover:bg-[#3b0314]/35 text-[#320211]",
  },
];

const PER_PAGE = 3;

export function BranchCarousel({ cards }: { cards: BranchCard[] }) {
  const [start, setStart] = useState(0);
  const [pending, startTransition] = useTransition();
  const canSlide = cards.length > PER_PAGE;

  const visible = Array.from({ length: Math.min(PER_PAGE, cards.length) }, (_, i) => {
    const index = (start + i) % cards.length;
    return { card: cards[index], palette: PALETTES[index % PALETTES.length] };
  });

  return (
    <div className="relative flex flex-col lg:flex-row items-center gap-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full">
        {visible.map(({ card, palette: p }, i) => (
          // Kartu muncul berurutan (naik + memudar); ikut berlaku saat carousel digeser.
          <m.div
            key={card.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: i * 0.07, ease: EASE_OUT }}
            data-theme="dark"
            className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${p.card} p-5 text-gray-900 shadow-lg flex flex-col justify-between h-[170px]`}
          >
            <div className="pr-14">
              <h3 className={`text-base font-bold ${p.title} truncate`}>{card.title}</h3>
              <p className={`text-[11px] font-semibold ${p.sub} mt-0.5 truncate`}>{card.subtitle}</p>
              <div className="inline-flex items-center gap-1.5 mt-1 bg-black/10 px-2 py-0.5 rounded-md">
                <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} />
                <p className={`text-[10px] font-bold ${p.badge}`}>
                  {card.percent === null
                    ? "Belum ada staf"
                    : `Kehadiran: ${card.percent}% Hadir (${card.hadir}/${card.total} Staf)`}
                </p>
              </div>
            </div>

            <div className="absolute right-4 top-4 w-[3.25rem] h-[3.25rem] bg-white/20 backdrop-blur-sm rounded-xl border border-white/30 flex items-center justify-center shadow-inner p-2.5">
              <svg className={`w-6 h-6 ${p.title}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                />
              </svg>
            </div>

            <div className="flex items-end justify-between mt-auto pt-2">
              <div className="flex -space-x-2">
                {card.avatars.map((a, i) => (
                  <span
                    key={`${a}-${i}`}
                    className={`h-6 w-6 rounded-full ring-2 ${p.ring} ${p.avatar[i % 3]} text-ink text-[9px] font-bold flex items-center justify-center`}
                  >
                    {a}
                  </span>
                ))}
                {card.more > 0 && (
                  <span
                    className={`h-6 w-6 rounded-full ring-2 ${p.ring} ${p.more} text-[8px] font-bold flex items-center justify-center`}
                  >
                    +{card.more}
                  </span>
                )}
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => startTransition(() => openBranchEmployees(card.id))}
                className={`${p.btn} text-[11px] font-bold py-1.5 px-3 rounded-lg border border-black/15 transition disabled:opacity-60`}
              >
                Lihat Detail
              </button>
            </div>
          </m.div>
        ))}
      </div>

      {canSlide && (
        <button
          type="button"
          aria-label="Cabang berikutnya"
          onClick={() => setStart((s) => (s + 1) % cards.length)}
          className="flex self-end lg:self-auto lg:absolute lg:-right-5 lg:top-1/2 lg:-translate-y-1/2 w-10 h-10 rounded-full bg-panel-raised border border-line-strong text-gray-300 hover:text-ink items-center justify-center shadow-lg transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} />
          </svg>
        </button>
      )}
    </div>
  );
}
