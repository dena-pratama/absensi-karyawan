import type { KasbonItem } from "@/lib/data/kasbon";
import type { KasbonStatus } from "@/lib/labels";

/** Filter Laporan Kasbon. Dipakai halaman (client) & export PDF (server) supaya hasilnya sama. */
export type KasbonReportFilters = {
  period: string; // period_start; "" = semua periode
  branch: string; // cabang penempatan karyawan saat ini; "" = semua
  status: "" | KasbonStatus;
  q: string;
};

export type KasbonRecap = {
  employeeId: string;
  name: string;
  nik: string;
  branch: string;
  count: number;
  requested: number;
  disbursed: number;
  open: number;
};

export const KASBON_STATUSES: KasbonStatus[] = ["diajukan", "disetujui", "ditolak", "dicairkan", "lunas", "dibatalkan"];

export const effectiveStatus = (k: KasbonItem): KasbonStatus => (k.autoSettled ? "lunas" : k.status);
export const isDisbursed = (k: KasbonItem) => k.status === "dicairkan" || k.status === "lunas";
/** Sudah cair tapi belum dipotong gaji (periodenya belum lewat & belum ditandai lunas). */
export const isOpen = (k: KasbonItem) => k.status === "dicairkan" && !k.autoSettled;

/** Baca filter dari query string export (nilai tidak dikenal diabaikan). */
export function parseKasbonFilters(params: URLSearchParams): KasbonReportFilters {
  const status = params.get("status") ?? "";
  return {
    period: /^\d{4}-\d{2}-\d{2}$/.test(params.get("period") ?? "") ? params.get("period")! : "",
    branch: params.get("branch") ?? "",
    status: (KASBON_STATUSES as string[]).includes(status) ? (status as KasbonStatus) : "",
    q: (params.get("q") ?? "").slice(0, 100),
  };
}

export function kasbonFilterQuery(f: KasbonReportFilters) {
  const p = new URLSearchParams();
  if (f.period) p.set("period", f.period);
  if (f.branch) p.set("branch", f.branch);
  if (f.status) p.set("status", f.status);
  if (f.q.trim()) p.set("q", f.q.trim());
  return p.toString();
}

/**
 * Saring kasbon lalu hitung ringkasan & rekap per karyawan.
 * Kasbon ditolak / dibatalkan tetap tampil di detail tapi tidak dihitung nominalnya.
 */
export function buildKasbonReport(
  items: KasbonItem[],
  f: KasbonReportFilters,
  branchOf: Map<string, string>, // employee_id → branch_id
  branchCode: Map<string, string>, // branch_id → kode
) {
  const q = f.q.trim().toLowerCase();
  const filtered = items.filter(
    (k) =>
      (!f.period || k.periodStart === f.period) &&
      (!f.branch || branchOf.get(k.employeeId) === f.branch) &&
      (!f.status || effectiveStatus(k) === f.status) &&
      (!q || k.name.toLowerCase().includes(q) || k.nik.toLowerCase().includes(q)),
  );
  const counted = filtered.filter((k) => k.status !== "ditolak" && k.status !== "dibatalkan");
  const sum = (list: KasbonItem[]) => list.reduce((s, k) => s + k.amount, 0);
  const totals = {
    count: counted.length,
    requested: sum(counted),
    waiting: sum(counted.filter((k) => k.status === "diajukan" || k.status === "disetujui")),
    disbursed: sum(counted.filter(isDisbursed)),
    open: sum(counted.filter(isOpen)),
  };

  const byEmployee = new Map<string, KasbonRecap>();
  for (const k of counted) {
    const r = byEmployee.get(k.employeeId) ?? {
      employeeId: k.employeeId,
      name: k.name,
      nik: k.nik,
      branch: branchCode.get(branchOf.get(k.employeeId) ?? "") ?? "-",
      count: 0,
      requested: 0,
      disbursed: 0,
      open: 0,
    };
    r.count++;
    r.requested += k.amount;
    if (isDisbursed(k)) r.disbursed += k.amount;
    if (isOpen(k)) r.open += k.amount;
    byEmployee.set(k.employeeId, r);
  }
  const recap = [...byEmployee.values()].sort((a, b) => b.requested - a.requested);

  return { filtered, totals, recap };
}
