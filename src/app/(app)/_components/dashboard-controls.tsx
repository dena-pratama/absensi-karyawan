"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { DateRangePicker } from "@/components/date-range-picker";
import { Icon } from "@/components/icon";

/**
 * Filter dashboard: rentang tanggal + tombol Global. Disimpan di URL (?dari=&sampai=&lingkup=global),
 * jadi tombol Global ditekan lagi = kembali ke cabang yang dipilih di topbar.
 */
export function DashboardControls({
  from,
  to,
  today,
  global,
  branchCode,
}: {
  from: string;
  to: string;
  today: string;
  global: boolean;
  branchCode: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const go = (next: { from?: string; to?: string; global?: boolean }) => {
    const f = next.from ?? from;
    const t = next.to ?? to;
    const g = next.global ?? global;
    const qs = new URLSearchParams();
    if (f !== today || t !== today) {
      qs.set("dari", f);
      qs.set("sampai", t);
    }
    if (g) qs.set("lingkup", "global");
    start(() => router.push(qs.size ? `/?${qs}` : "/", { scroll: false }));
  };

  return (
    <div className={`flex items-center gap-2 flex-shrink-0 transition-opacity ${pending ? "opacity-60" : ""}`}>
      <button
        type="button"
        onClick={() => go({ global: !global })}
        aria-pressed={global}
        title={global ? `Kembali ke cabang ${branchCode}` : "Tampilkan gabungan semua cabang"}
        className={`flex items-center gap-1.5 h-8 px-3 rounded-lg border text-[11px] font-semibold whitespace-nowrap transition ${
          global
            ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/40"
            : "border-line-strong text-gray-300 bg-panel-inset hover:text-brand-ink hover:border-cyan-500/50"
        }`}
      >
        <Icon name={global ? "public" : "storefront"} className="text-[15px]" />
        {global ? "Global" : branchCode}
        <Icon name="swap_horiz" className="text-[14px] opacity-60" />
      </button>
      <DateRangePicker from={from} to={to} max={today} onApply={(r) => go(r)} />
      {pending && <span className="w-3.5 h-3.5 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" aria-label="Memuat" />}
    </div>
  );
}
