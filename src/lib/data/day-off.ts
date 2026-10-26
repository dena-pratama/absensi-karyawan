import "server-only";
import { shiftDay, todayWIB } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { getMyAccess } from "./access";

/** PostgREST: tabel / fungsi belum ada (migrasi day_off belum dijalankan). */
const MISSING = new Set(["PGRST202", "PGRST205", "42883", "42P01"]);

export type DayOffStatus = "diajukan" | "disetujui" | "ditolak" | "dibatalkan" | "dipindah" | "masuk";
export type SwapStatus = "menunggu_rekan" | "menunggu_atasan" | "disetujui" | "ditolak" | "dibatalkan";

export type DayOffItem = {
  id: string;
  employeeId: string;
  name: string;
  nik: string;
  branchCode: string;
  offDate: string;
  kind: "jatah" | "pengganti";
  status: DayOffStatus;
  /** Pengajuan pindah: tanggal libur lama. */
  movedFrom: string | null;
  note: string | null;
  decisionNote: string | null;
  requestedAt: string;
};

export type SwapItem = {
  id: string;
  status: SwapStatus;
  requester: string;
  partner: string;
  requesterDate: string;
  partnerDate: string;
  branchCode: string;
  note: string | null;
  requestedAt: string;
};

/** Riwayat yang dimuat: 60 hari ke belakang + semua yang akan datang. */
const HISTORY_DAYS = 60;

/**
 * Data halaman Libur (admin & Office): pengajuan / jadwal libur dan tukar off.
 * ready=false bila migrasi day_off belum dijalankan.
 */
export async function getDayOffPage() {
  const supabase = await createClient();
  const { role } = await getMyAccess();
  const from = shiftDay(todayWIB(), -HISTORY_DAYS);

  const [offs, swaps, assigns] = await Promise.all([
    supabase
      .from("day_off")
      .select("id, employee_id, off_date, kind, status, note, decision_note, requested_at, replaces_id, employee:employee_id(nik, full_name)")
      .gte("off_date", from)
      .order("off_date", { ascending: true })
      .limit(2000),
    supabase
      .from("day_off_swap")
      .select("id, status, note, requested_at, requester_off_id, partner_off_id, requester:requester_id(full_name), partner:partner_id(full_name)")
      .order("requested_at", { ascending: false })
      .limit(200),
    supabase.from("employee_assignment").select("employee_id, branch:branch_id(code)").is("valid_to", null),
  ]);
  if (offs.error && MISSING.has(offs.error.code)) return { ready: false as const, role };
  if (offs.error) throw new Error(`Gagal memuat libur: ${offs.error.message}`);

  type Off = {
    id: string;
    employee_id: string;
    off_date: string;
    kind: DayOffItem["kind"];
    status: DayOffStatus;
    note: string | null;
    decision_note: string | null;
    requested_at: string;
    replaces_id: string | null;
    employee: { nik: string; full_name: string } | null;
  };
  const rows = (offs.data ?? []) as unknown as Off[];
  const branchOf = new Map(
    ((assigns.data ?? []) as unknown as { employee_id: string; branch: { code: string } | null }[]).map((a) => [a.employee_id, a.branch?.code ?? "-"]),
  );
  const dateOf = new Map(rows.map((r) => [r.id, r.off_date]));

  const items: DayOffItem[] = rows.map((r) => ({
    id: r.id,
    employeeId: r.employee_id,
    name: r.employee?.full_name ?? "-",
    nik: r.employee?.nik ?? "-",
    branchCode: branchOf.get(r.employee_id) ?? "-",
    offDate: r.off_date,
    kind: r.kind,
    status: r.status,
    movedFrom: r.replaces_id ? (dateOf.get(r.replaces_id) ?? "?") : null,
    note: r.note,
    decisionNote: r.decision_note,
    requestedAt: r.requested_at,
  }));

  type Swap = {
    id: string;
    status: SwapStatus;
    note: string | null;
    requested_at: string;
    requester_off_id: string;
    partner_off_id: string;
    requester: { full_name: string } | null;
    partner: { full_name: string } | null;
  };
  const offById = new Map(items.map((i) => [i.id, i]));
  const swapItems: SwapItem[] = ((swaps.data ?? []) as unknown as Swap[]).map((s) => {
    const a = offById.get(s.requester_off_id);
    const b = offById.get(s.partner_off_id);
    return {
      id: s.id,
      status: s.status,
      requester: s.requester?.full_name ?? "-",
      partner: s.partner?.full_name ?? "-",
      requesterDate: a?.offDate ?? "-",
      partnerDate: b?.offDate ?? "-",
      branchCode: a?.branchCode ?? "-",
      note: s.note,
      requestedAt: s.requested_at,
    };
  });

  return { ready: true as const, role, items, swaps: swapItems };
}

export type DayOffSettings = {
  compValidDays: number;
  roles: { id: string; name: string; days: number | null }[];
  overrides: { employeeId: string; name: string; nik: string; days: number }[];
};

/** Pengaturan jatah libur (admin). */
export async function getDayOffSettings(): Promise<{ ready: false } | ({ ready: true } & DayOffSettings)> {
  const supabase = await createClient();
  const [setting, roles, roleDays, overrides] = await Promise.all([
    supabase.from("day_off_setting").select("comp_valid_days").maybeSingle(),
    supabase.from("job_role").select("id, name").eq("is_active", true).order("name"),
    supabase.from("job_role_day_off").select("job_role_id, days"),
    supabase.from("employee_day_off").select("employee_id, days, employee:employee_id(nik, full_name)"),
  ]);
  for (const r of [setting, roleDays, overrides]) {
    if (r.error && MISSING.has(r.error.code)) return { ready: false };
    if (r.error) throw new Error(`Gagal memuat pengaturan libur: ${r.error.message}`);
  }
  const daysOf = new Map((roleDays.data ?? []).map((r) => [r.job_role_id as string, Number(r.days)]));
  type O = { employee_id: string; days: number; employee: { nik: string; full_name: string } | null };
  return {
    ready: true,
    compValidDays: Number(setting.data?.comp_valid_days ?? 30),
    roles: (roles.data ?? []).map((r) => ({ id: r.id as string, name: r.name as string, days: daysOf.get(r.id as string) ?? null })),
    overrides: ((overrides.data ?? []) as unknown as O[])
      .map((o) => ({ employeeId: o.employee_id, name: o.employee?.full_name ?? "-", nik: o.employee?.nik ?? "-", days: Number(o.days) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
