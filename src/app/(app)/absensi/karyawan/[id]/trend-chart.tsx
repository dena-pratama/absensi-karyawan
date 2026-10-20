"use client";

import { useState } from "react";

export type TrendPoint = {
  month: string; // "Okt"
  label: string; // "Oktober 2026"
  percent: number | null;
  hadir: number;
  total: number;
};

// Ukuran viewBox; SVG diskalakan ke lebar container.
const W = 560;
const H = 220;
const PAD = { top: 24, right: 12, bottom: 28, left: 36 };
const BAR_MAX = 24;
const TICKS = [0, 50, 100];

/**
 * Kolom % kehadiran per bulan (satu seri → tanpa legend; judul kartu yang menamai).
 * Hover/fokus per kolom menampilkan tooltip; tabel tersembunyi untuk pembaca layar.
 */
export function TrendChart({ points }: { points: TrendPoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const band = plotW / points.length;
  const barW = Math.min(BAR_MAX, band * 0.5);
  const y = (p: number) => PAD.top + plotH - (p / 100) * plotH;
  const last = points.length - 1;
  const hovered = active === null ? null : points[active];

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Tren persentase kehadiran per bulan">
        {/* Grid & sumbu Y */}
        {TICKS.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-gray-500 text-[10px]">
              {t}%
            </text>
          </g>
        ))}

        {points.map((p, i) => {
          const cx = PAD.left + band * i + band / 2;
          const x = cx - barW / 2;
          const top = p.percent === null ? null : y(p.percent);
          const h = top === null ? 0 : PAD.top + plotH - top;
          const r = Math.min(4, h);
          const isActive = active === i;
          const isLast = i === last;
          return (
            <g key={p.label}>
              {top !== null && h > 0 && (
                <path
                  // Ujung atas membulat 4px, dasar persegi.
                  d={`M${x},${PAD.top + plotH} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${PAD.top + plotH} Z`}
                  fill="#00d2ff"
                  // Bulan berjalan penuh, bulan lain diredam.
                  opacity={active === null || isActive ? (isLast ? 1 : 0.55) : 0.3}
                />
              )}
              {p.percent === null && (
                <text x={cx} y={PAD.top + plotH - 6} textAnchor="middle" className="fill-gray-600 text-[10px]">
                  –
                </text>
              )}
              {/* Label nilai hanya di bulan berjalan */}
              {isLast && top !== null && (
                <text x={cx} y={top - 6} textAnchor="middle" className="fill-ink text-[11px] font-semibold">
                  {Math.round(p.percent!)}%
                </text>
              )}
              <text x={cx} y={H - 8} textAnchor="middle" className={`text-[10px] ${isLast ? "fill-gray-200" : "fill-gray-500"}`}>
                {p.month}
              </text>
              {/* Area hover lebih besar dari batang */}
              <rect
                x={PAD.left + band * i}
                y={PAD.top}
                width={band}
                height={plotH}
                fill="transparent"
                tabIndex={0}
                aria-label={`${p.label}: ${p.percent === null ? "belum ada data" : `${Math.round(p.percent)}% hadir`}`}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className="outline-none cursor-default"
              />
            </g>
          );
        })}
      </svg>

      {hovered && active !== null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-lg bg-panel-raised border border-line-strong px-2.5 py-1.5 text-[11px] text-gray-100 shadow-xl whitespace-nowrap"
          style={{
            left: `${((PAD.left + (W - PAD.left - PAD.right) / points.length * (active + 0.5)) / W) * 100}%`,
            top: `${((hovered.percent === null ? PAD.top + plotH : y(hovered.percent)) / H) * 100}%`,
          }}
        >
          <div className="font-semibold">{hovered.label}</div>
          <div className="text-gray-400">
            {hovered.percent === null
              ? "Belum ada data"
              : `${Math.round(hovered.percent)}% hadir • ${hovered.hadir}/${hovered.total} hari`}
          </div>
        </div>
      )}

      <table className="sr-only">
        <caption>Persentase kehadiran per bulan</caption>
        <thead>
          <tr>
            <th scope="col">Bulan</th>
            <th scope="col">% Hadir</th>
            <th scope="col">Hari hadir</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.label}>
              <td>{p.label}</td>
              <td>{p.percent === null ? "-" : `${Math.round(p.percent)}%`}</td>
              <td>
                {p.hadir}/{p.total}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
