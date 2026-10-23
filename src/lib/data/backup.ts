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
  const raw = (data ?? []) as unknown as Row[];

  // SPV tidak bisa membaca cabang di luar cabangnya, jadi kode cabang lawan (asal / tujuan)
  // bisa kosong — ambil dari backup_branch_options() (khusus admin & SPV, hanya id/kode/nama).
  const missing = raw.some((r) => !r.to_branch || (r.from_branch_id && !r.from_branch));
  const extra = new Map<string, { code: string; name: string }>();
  if (missing) {
    const { data: opts } = await supabase.rpc("backup_branch_options");
    for (const o of (opts ?? []) as { id: string; code: string; name: string }[]) extra.set(o.id, o);
  }

  return {
    ready: true,
    rows: raw.map((r) => ({
      id: r.id,
      employeeId: r.employee_id,
      nik: r.employee?.nik ?? "-",
      name: r.employee?.full_name ?? "-",
      fromBranchId: r.from_branch_id ?? "",
      fromCode: r.from_branch?.code ?? extra.get(r.from_branch_id ?? "")?.code ?? "-",
      toBranchId: r.to_branch_id,
      toCode: r.to_branch?.code ?? extra.get(r.to_branch_id)?.code ?? "-",
      toName: r.to_branch?.name ?? extra.get(r.to_branch_id)?.name ?? "-",
      dateFrom: r.date_from,
      dateTo: r.date_to,
      note: r.note ?? "",
    })),
  };
}

/**
 * Status lokasi karyawan pada hari itu, relatif ke cabang yang sedang dilihat:
 * - in        = karyawan cabang lain yang di-backup ke sini
 * - out       = karyawan cabang ini yang sedang backup di cabang lain (hanya-lihat)
 * - visit     = karyawan cabang lain (mis. SPV) yang absen di sini hari itu
 * - elsewhere = karyawan cabang ini yang absen di cabang lain hari itu (hanya-lihat)
 * branchCode = cabang lawan (asal untuk in/visit, tujuan untuk out/elsewhere).
 */
export type DayBackup = { kind: "in" | "out" | "visit" | "elsewhere"; branchCode: string };
export type DayRosterEntry = RosterEntry & { backup: DayBackup | null };

/** Peta id → kode cabang. SPV hanya bisa membaca cabangnya, jadi dilengkapi dari backup_branch_options(). */
export async function getBranchCodes(): Promise<Map<string, string>> {
  const supabase = await createClient();
  const [{ data: rows }, { data: opts }] = await Promise.all([
    supabase.from("branch").select("id, code"),
    supabase.rpc("backup_branch_options"),
  ]);
  const codes = new Map<string, string>();
  for (const b of [...((rows ?? []) as { id: string; code: string }[]), ...((opts ?? []) as { id: string; code: string }[])]) {
    codes.set(b.id, b.code);
  }
  return codes;
}

/**
 * Daftar karyawan satu cabang untuk satu tanggal. Absensi dicatat & dihitung di cabang
 * tempat absen, jadi selain karyawan cabang ini ikut tampil karyawan backup yang masuk
 * dan karyawan cabang lain (mis. SPV) yang sudah absen di sini hari itu.
 */
export async function getDayRoster(branchId: string, date: string): Promise<DayRosterEntry[]> {
  const supabase = await createClient();
  const [home, { rows }, { data: att }, codes] = await Promise.all([
    getRoster(branchId, date),
    getBackups({ from: date, to: date }),
    supabase.from("attendance_daily").select("employee_id, branch_id").eq("attendance_date", date),
    getBranchCodes(),
  ]);
  const attBranch = new Map(((att ?? []) as { employee_id: string; branch_id: string }[]).map((a) => [a.employee_id, a.branch_id]));
  const out = new Map(rows.filter((b) => b.fromBranchId === branchId).map((b) => [b.employeeId, b.toCode]));
  const incoming = rows.filter((b) => b.toBranchId === branchId);
  const fromCode = new Map(incoming.map((b) => [b.employeeId, b.fromCode]));
  const homeIds = new Set(home.map((r) => r.employeeId));
  const visitorIds = [...attBranch].filter(([id, b]) => b === branchId && !homeIds.has(id)).map(([id]) => id);

  const others = await getRosterForEmployees(
    [...new Set([...incoming.map((b) => b.employeeId), ...visitorIds])],
    date,
  );

  const homeRows: DayRosterEntry[] = home.map((r) => {
    if (out.has(r.employeeId)) return { ...r, backup: { kind: "out", branchCode: out.get(r.employeeId)! } };
    const at = attBranch.get(r.employeeId);
    if (at && at !== branchId) return { ...r, backup: { kind: "elsewhere", branchCode: codes.get(at) ?? "-" } };
    return { ...r, backup: null };
  });
  const otherRows: DayRosterEntry[] = others
    .filter((r) => !homeIds.has(r.employeeId))
    .map((r) =>
      fromCode.has(r.employeeId)
        ? { ...r, backup: { kind: "in", branchCode: fromCode.get(r.employeeId) ?? "-" } }
        : { ...r, backup: { kind: "visit", branchCode: codes.get(r.branchId) ?? "-" } },
    );
  return [...homeRows, ...otherRows].sort((a, b) => a.nik.localeCompare(b.nik));
}
