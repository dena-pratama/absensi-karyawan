import { monthOf, monthRange, parseDateParam, todayWIB } from "@/lib/format";
import type { AttendanceStatus } from "@/lib/labels";

export type ReportFilters = {
  branchId: string; // "" = semua cabang
  employeeId: string; // "" = semua karyawan
  from: string;
  to: string;
  status: AttendanceStatus | "";
};

/** Batas rentang tanggal satu kali tarik data. */
export const MAX_RANGE_DAYS = 366;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ["hadir", "sakit", "tidak_hadir"];

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

function get(params: Params, key: string): string | undefined {
  if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
  const v = params[key];
  return typeof v === "string" ? v : undefined;
}

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/**
 * Baca filter laporan dari query string (?cabang=&karyawan=&dari=&sampai=&status=).
 * Default: awal bulan berjalan s/d hari ini. Nilai tidak valid diganti default.
 */
export function parseReportFilters(params: Params): ReportFilters & { error: string | null } {
  const today = todayWIB();
  const branchId = get(params, "cabang") ?? "";
  const employeeId = get(params, "karyawan") ?? "";
  const status = get(params, "status") ?? "";
  let from = parseDateParam(get(params, "dari"), monthRange(monthOf(today)).start);
  let to = parseDateParam(get(params, "sampai"), today);
  let error: string | null = null;

  if (to > today) to = today;
  if (from > to) {
    error = "Tanggal awal lebih besar dari tanggal akhir, jadi ditukar otomatis.";
    [from, to] = [to, from];
  }
  if (daysBetween(from, to) >= MAX_RANGE_DAYS) {
    error = `Rentang maksimal ${MAX_RANGE_DAYS} hari, jadi tanggal awal disesuaikan.`;
    const d = new Date(`${to}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (MAX_RANGE_DAYS - 1));
    from = d.toISOString().slice(0, 10);
  }

  return {
    branchId: UUID.test(branchId) ? branchId : "",
    employeeId: UUID.test(employeeId) ? employeeId : "",
    from,
    to,
    status: STATUSES.includes(status) ? (status as AttendanceStatus) : "",
    error,
  };
}

/** Query string untuk tautan unduh / filter. */
export function reportQuery(f: ReportFilters) {
  const p = new URLSearchParams();
  if (f.branchId) p.set("cabang", f.branchId);
  if (f.employeeId) p.set("karyawan", f.employeeId);
  p.set("dari", f.from);
  p.set("sampai", f.to);
  if (f.status) p.set("status", f.status);
  return p.toString();
}
