export function SettingsSkeleton() {
  const block = "rounded-2xl bg-panel border border-line animate-pulse";
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`${block} h-28`} />
        ))}
      </div>
      <div className={`${block} h-14`} />
      <div className={`${block} h-96`} />
    </>
  );
}

/** Kartu statistik di atas halaman Pengaturan. */
export function StatCard({
  label,
  value,
  unit,
  note,
  tone,
}: {
  label: string;
  value: string | number;
  unit: string;
  note: string;
  tone: "cyan" | "emerald" | "amber";
}) {
  const dot = { cyan: "bg-cyan-400", emerald: "bg-emerald-400", amber: "bg-amber-400" }[tone];
  const text = { cyan: "text-cyan-300", emerald: "text-emerald-300", amber: "text-amber-300" }[tone];
  return (
    <div className="bg-panel border border-line rounded-2xl p-5 flex flex-col gap-2 hover:border-line-strong transition">
      <div className="text-[11px] font-semibold tracking-wider uppercase text-gray-400">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold text-ink tabular-nums">{value}</span>
        <span className="text-xs text-gray-400">{unit}</span>
      </div>
      <div className={`flex items-center gap-1.5 text-[11px] ${text} truncate`}>
        <span className={`w-1.5 h-1.5 rounded-full ${dot} flex-shrink-0`} />
        <span className="truncate">{note}</span>
      </div>
    </div>
  );
}
