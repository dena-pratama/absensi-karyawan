import Link from "next/link";
import { CountUp, GrowBar } from "@/components/dashboard-motion";
import { Icon } from "@/components/icon";
import type { RangeSummary } from "@/lib/data/dashboard";
import { formatDateLong } from "@/lib/format";

export type SummaryExtras = {
  /** Kasbon menunggu persetujuan (null = tidak ditampilkan, mis. untuk Office). */
  kasbonPending: number | null;
  /** Penugasan backup yang aktif di rentang ini. */
  backups: number;
};

const shortDate = (ymd: string) => formatDateLong(ymd).replace(/^[^,]+, /, "");

/**
 * Ringkasan kehadiran (dashboard admin & Office) untuk satu tanggal atau rentang tanggal,
 * untuk cabang terpilih atau semua cabang: persentase hadir, pembanding periode sebelumnya,
 * komposisi status, kelengkapan pengisian, cabang terendah, backup & kasbon.
 */
export function TodaySummary({
  summary,
  isToday,
  scopeLabel,
  extras,
  controls,
}: {
  summary: RangeSummary;
  isToday: boolean;
  /** Kode cabang terpilih, atau "Semua cabang" saat mode Global. */
  scopeLabel: string;
  extras: SummaryExtras;
  /** Filter rentang tanggal & tombol Global (client). */
  controls?: React.ReactNode;
}) {
  const { hadir, sakit, tidakHadir, libur, belum, expected, percent, filled, prevPercent, days } = summary;
  const delta = percent !== null && prevPercent !== null ? percent - prevPercent : null;
  const single = days === 1;
  const title = single ? (isToday ? "Ringkasan Hari Ini" : "Ringkasan Harian") : `Ringkasan ${days} Hari`;
  const period = single ? formatDateLong(summary.from) : `${shortDate(summary.from)} s/d ${shortDate(summary.to)}`;

  const parts = [
    { label: "Hadir", value: hadir, color: "bg-emerald-400", text: "text-emerald-300" },
    { label: "Sakit", value: sakit, color: "bg-amber-400", text: "text-amber-300" },
    { label: "Tidak Hadir", value: tidakHadir, color: "bg-rose-400", text: "text-rose-300" },
    { label: "Libur", value: libur, color: "bg-sky-400", text: "text-sky-300" },
    { label: "Belum Diabsen", value: belum, color: "bg-gray-500", text: "text-gray-400" },
  ];

  // Lingkaran persentase (SVG): keliling r=42
  const C = 2 * Math.PI * 42;

  return (
    <section aria-labelledby="summary-title" className="@container bg-panel border border-line rounded-2xl p-5 flex flex-col gap-5 h-full">
      {/* Kartu lebar: judul & filter sebaris (filter tidak pernah terpecah). Kartu sempit: filter di bawah judul. */}
      <div className="flex flex-col @xl:flex-row @xl:items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="summary-title" className="text-sm font-bold text-ink flex items-center gap-2">
            <Icon name="monitoring" className="text-[18px] text-brand-ink" />
            {title} · {scopeLabel}
          </h2>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {period} · {summary.branchCount} cabang · {summary.staff} staf aktif ·{" "}
            <Link href={`/absensi?tanggal=${summary.to}`} className="text-brand-ink hover:underline underline-offset-2">
              Buka Absensi
            </Link>
          </p>
        </div>
        {controls}
      </div>

      <div className="flex flex-col sm:flex-row gap-5 sm:items-center">
        {/* Persentase hadir */}
        <div className="flex flex-col items-center gap-1.5 flex-shrink-0 self-center">
          <div className="relative w-32 h-32">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90" aria-hidden="true">
              <circle cx="50" cy="50" r="42" fill="none" strokeWidth="9" stroke="currentColor" className="text-gray-500/20" />
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                strokeWidth="9"
                strokeLinecap="round"
                className="stroke-cyan-400 transition-[stroke-dashoffset] duration-700"
                strokeDasharray={C}
                strokeDashoffset={C * (1 - (percent ?? 0) / 100)}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-ink tabular-nums">{percent === null ? "-" : <CountUp value={percent} />}</span>
              <span className="text-[10px] text-gray-400">kehadiran</span>
            </div>
          </div>
          {delta !== null && (
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                delta >= 0 ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/30" : "text-rose-300 bg-rose-500/10 border-rose-500/30"
              }`}
            >
              {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)} poin vs {single ? "hari sebelumnya" : "periode sebelumnya"}
            </span>
          )}
        </div>

        {/* Komposisi status */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          <div
            className="flex h-3 w-full gap-[2px] rounded-full overflow-hidden bg-panel-raised"
            role="img"
            aria-label={parts.map((p) => `${p.label} ${p.value}`).join(", ")}
          >
            {expected > 0 &&
              parts
                .filter((p) => p.value > 0)
                .map((p, i) => <GrowBar key={p.label} percent={(p.value / expected) * 100} index={i} className={`h-full ${p.color}`} />)}
          </div>
          <dl className="grid grid-cols-2 @lg:grid-cols-3 gap-2">
            {parts.map((p) => (
              <div key={p.label} className="rounded-xl bg-panel-inset border border-line px-3 py-2">
                <dt className="text-[10px] text-gray-400 flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${p.color}`} />
                  {p.label}
                </dt>
                <dd className={`text-lg font-bold tabular-nums ${p.text}`}>
                  {p.value}
                  <span className="text-[10px] font-normal text-gray-500 ml-1">{expected ? `${Math.round((p.value / expected) * 100)}%` : ""}</span>
                </dd>
              </div>
            ))}
          </dl>
          {!single && <p className="text-[10px] text-gray-500">Angka = jumlah absensi (staf × hari) dalam rentang ini.</p>}
        </div>
      </div>

      {/* Indikator lain */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
        <Kpi
          icon="fact_check"
          label="Pengisian absensi"
          value={filled === null ? "-" : `${filled}%`}
          note={`${summary.completeBranches}/${summary.branchCount} cabang lengkap`}
        />
        <Kpi
          icon="trending_down"
          label="Kehadiran terendah"
          value={summary.lowest ? `${summary.lowest.percent}%` : "-"}
          note={summary.lowest ? summary.lowest.code : "belum ada data"}
          warn={!!summary.lowest && summary.lowest.percent < 85}
        />
        <Kpi icon="swap_horiz" label={single && isToday ? "Backup hari ini" : "Backup di rentang ini"} value={String(extras.backups)} note="penugasan" href="/backup" />
        {extras.kasbonPending !== null ? (
          <Kpi icon="payments" label="Kasbon menunggu" value={String(extras.kasbonPending)} note="perlu persetujuan" href="/kasbon" warn={extras.kasbonPending > 0} />
        ) : (
          <Kpi icon="groups" label="Staf aktif" value={String(summary.staff)} note={`${summary.branchCount} cabang`} />
        )}
      </div>
    </section>
  );
}

function Kpi({ icon, label, value, note, href, warn }: { icon: string; label: string; value: string; note: string; href?: string; warn?: boolean }) {
  const body = (
    <>
      <span className="text-[10px] text-gray-400 flex items-center gap-1">
        <Icon name={icon} className="text-[14px]" />
        {label}
      </span>
      <span className={`block text-base font-bold tabular-nums ${warn ? "text-amber-300" : "text-ink"}`}>{value}</span>
      <span className="block text-[10px] text-gray-500 truncate">{note}</span>
    </>
  );
  const cls = "rounded-xl bg-panel-inset border border-line px-3 py-2.5 block";
  return href ? (
    <Link href={href} className={`${cls} hover:border-line-strong transition`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
