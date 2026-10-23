import Link from "next/link";
import { Icon } from "@/components/icon";
import { getEmployeeKasbon } from "@/lib/data/kasbon";
import { formatDateShort, formatRupiah } from "@/lib/format";
import { effectiveStatus, isOpen } from "@/lib/kasbon-report";
import { KASBON_STATUS_LABEL, type KasbonStatus } from "@/lib/labels";

const PILL: Record<KasbonStatus, string> = {
  diajukan: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  disetujui: "bg-cyan-500/10 text-cyan-300 border-cyan-500/30",
  ditolak: "bg-rose-500/10 text-rose-300 border-rose-500/30",
  dicairkan: "bg-purple-500/10 text-purple-300 border-purple-500/30",
  lunas: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  dibatalkan: "bg-panel-raised text-gray-400 border-line-strong",
};

const stamp = (iso: string) =>
  new Date(iso).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric" });

/**
 * Riwayat kasbon di halaman Detail Karyawan, tepat di bawah kartu profil.
 * Tidak tampil untuk SPV yang melihat karyawan lain (kasbon bersifat pribadi).
 */
export async function KasbonHistory({ employeeId }: { employeeId: string }) {
  const data = await getEmployeeKasbon(employeeId);
  if (!data.visible) return null;
  const { items, total, quota } = data;
  const open = items.filter(isOpen).reduce((s, k) => s + k.amount, 0);

  return (
    <section aria-labelledby="kasbon-history-title" className="bg-panel border border-line rounded-2xl p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 id="kasbon-history-title" className="text-sm font-bold text-ink flex items-center gap-2">
            <Icon name="account_balance_wallet" className="text-[18px] text-brand-ink" />
            Riwayat Kasbon
          </h3>
          <p className="text-[11px] text-gray-400 mt-0.5">{total ? `${total} kasbon tercatat` : "Belum pernah kasbon"}</p>
        </div>
        <Link href="/kasbon" className="text-[11px] text-brand-ink hover:underline underline-offset-2 flex-shrink-0">
          Buka Kasbon
        </Link>
      </div>

      {quota && quota.salarySource && (
        <dl className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl bg-panel-inset border border-line px-3 py-2.5">
            <dt className="text-[10px] text-gray-400">Sisa plafon periode ini</dt>
            <dd className="text-sm font-bold text-emerald-300 tabular-nums mt-0.5">{formatRupiah(quota.available)}</dd>
            <dd className="text-[10px] text-gray-500">
              dari {formatRupiah(quota.plafon)} · {quota.hk} HK
            </dd>
          </div>
          <div className="rounded-xl bg-panel-inset border border-line px-3 py-2.5">
            <dt className="text-[10px] text-gray-400">Belum dipotong gaji</dt>
            <dd className="text-sm font-bold text-brand-ink tabular-nums mt-0.5">{formatRupiah(open)}</dd>
            <dd className="text-[10px] text-gray-500">s/d {formatDateShort(quota.periodEnd)}</dd>
          </div>
        </dl>
      )}

      {items.length ? (
        <ul className="divide-y divide-line/60 -my-1">
          {items.map((k) => {
            const st = effectiveStatus(k);
            return (
              <li key={k.id} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <div className="text-gray-100 font-semibold tabular-nums">{formatRupiah(k.amount)}</div>
                  <div className="text-[10px] text-gray-500">
                    {stamp(k.requestedAt)}
                    {k.note && <span className="text-gray-400"> · {k.note}</span>}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${PILL[st]}`}>{KASBON_STATUS_LABEL[st]}</span>
                  {k.proofUrl && (
                    <a
                      href={k.proofUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] text-brand-ink hover:underline underline-offset-2 flex items-center gap-0.5"
                    >
                      <Icon name="image" className="text-[12px]" />
                      Bukti
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-gray-400 py-2 text-center">Belum ada kasbon.</p>
      )}
      {total > items.length && (
        <p className="text-[10px] text-gray-500 text-center">
          Menampilkan {items.length} kasbon terbaru dari {total}.
        </p>
      )}
    </section>
  );
}
