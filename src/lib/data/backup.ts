import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getRoster, getRosterForEmployees, type RosterEntry } from "./attendance";

/** Penugasan backup: karyawan dipinjam sementara ke cabang lain (migrasi backup_and_multi_branch_spv). */
export type BackupRow = {
  id: string;
  employeeId: string;
  nik: string;
  name: string;
  fromBranchId: string;
  fromCode: string;
  toBranchId: string;
  toCode: string;
  toName: string;
  dateFrom: string;
  dateTo: string;
  note: string;
};

type Row = {
  id: string;
  employee_id: string;
  from_branch_id: string | null;
  to_branch_id: string;
  date_from: string;
  date_to: string;
  note: string | null;
  employee: { nik: string; full_name: string } | null;
  from_branch: { code: string } | null;
  to_branch: { code: string; name: string } | null;
};

/**
 * Backup yang bersinggungan dengan rentang [from, to] (opsional: hanya yang masuk / keluar
 * cabang tertentu). ready=false bila tabelnya belum ada (migrasi belum dijalankan).
 */
export async function getBackups(opts: { from?: string; to?: string; branchId?: string } = {}): Promise<{
  ready: boolean;
  rows: BackupRow[];
}> {
  const supabase = await createClient();
  let q = supabase
    .from("employee_backup")
    .select(
      "id, employee_id, from_branch_id, to_branch_id, date_from, date_to, note, " +
        "employee:employee_id(nik, full_name), from_branch:from_branch_id(code), to_branch:to_branch_id(code, name)",
    )
    .order("date_from", { ascending: false });
  if (opts.to) q = q.lte("date_from", opts.to);
  if (opts.from) q = q.gte("date_to", opts.from);
  if (opts.branchId) q = q.or(`to_branch_id.eq.${opts.branchId},from_branch_id.eq.${opts.branchId}`);
  const { data, error } = await q;
  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01") return { ready: false, rows: [] };
    throw new Error(`Gagal memuat penugasan backup: ${error.message}`);
  }
  return {
    ready: true,
    rows: ((data ?? []) as unknown as Row[]).map((r) => ({
      id: r.id,
      employeeId: r.employee_id,
      nik: r.employee?.nik ?? "-",
      name: r.employee?.full_name ?? "-",
      fromBranchId: r.from_branch_id ?? "",
      fromCode: r.from_branch?.code ?? "-",
      toBranchId: r.to_branch_id,
      toCode: r.to_branch?.code ?? "-",
      toName: r.to_branch?.name ?? "-",
      dateFrom: r.date_from,
      dateTo: r.date_to,
      note: r.note ?? "",
    })),
  };
}

/** in = karyawan cabang lain yang di-backup ke sini; out = karyawan cabang ini yang sedang backup di cabang lain. */
export type DayBackup = { kind: "in" | "out"; branchCode: string };
export type DayRosterEntry = RosterEntry & { backup: DayBackup | null };

/**
 * Daftar karyawan satu cabang untuk satu tanggal:
 * karyawan cabang ini (yang sedang backup keluar ditandai "out") + karyawan backup yang masuk ("in").
 * Absensi karyawan backup dicatat di cabang tujuan.
 */
export async function getDayRoster(branchId: string, date: string): Promise<DayRosterEntry[]> {
  const [home, { rows }] = await Promise.all([getRoster(branchId, date), getBackups({ from: date, to: date })]);
  const out = new Map(rows.filter((b) => b.fromBranchId === branchId).map((b) => [b.employeeId, b.toCode]));
  const incoming = rows.filter((b) => b.toBranchId === branchId);
  const visiting = await getRosterForEmployees(
    incoming.map((b) => b.employeeId),
    date,
  );
  const fromCode = new Map(incoming.map((b) => [b.employeeId, b.fromCode]));
  const homeIds = new Set(home.map((r) => r.employeeId));

  return [
    ...home.map((r) => ({
      ...r,
      backup: out.has(r.employeeId) ? ({ kind: "out", branchCode: out.get(r.employeeId)! } as const) : null,
    })),
    ...visiting
      .filter((r) => !homeIds.has(r.employeeId))
      .map((r) => ({ ...r, backup: { kind: "in", branchCode: fromCode.get(r.employeeId) ?? "-" } as const })),
  ].sort((a, b) => a.nik.localeCompare(b.nik));
}
