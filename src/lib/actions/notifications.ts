"use server";

import { getMyAccess } from "@/lib/data/access";
import { formatTimeWIB } from "@/lib/format";
import { createServiceClient, isAdminApiConfigured } from "@/lib/supabase/admin";

export type NotificationKind = "check_in" | "check_out" | "kasbon" | "backup" | "libur";

export type AppNotification = {
  id: string;
  kind: NotificationKind;
  at: string; // ISO
  title: string;
  detail: string;
  /** Tujuan saat diklik (hanya dipakai untuk admin). */
  href: string;
};

export type NotificationResult =
  | { ok: true; items: AppNotification[]; canOpen: boolean }
  | { ok: false; error: string };

/** Default lonceng: 3 hari terakhir, maks. 40 terbaru. Halaman Notifikasi memakai rentang lebih panjang. */
const DEFAULT_DAYS = 3;
const DEFAULT_LIMIT = 40;
const MAX_DAYS = 31;
const MAX_LIMIT = 500;

/**
 * Notifikasi aktivitas untuk panel web (admin & Office): check in / out dari app, pengajuan kasbon,
 * penugasan backup baru. Dibaca lewat secret key (Office tidak bisa membaca kasbon orang lain lewat RLS),
 * hanya setelah role dicek. Admin bisa membuka halaman terkait; Office hanya melihat.
 */
export async function getNotifications(opts: { days?: number; limit?: number } = {}): Promise<NotificationResult> {
  const days = Math.min(Math.max(1, Math.trunc(opts.days ?? DEFAULT_DAYS)), MAX_DAYS);
  const limit = Math.min(Math.max(1, Math.trunc(opts.limit ?? DEFAULT_LIMIT)), MAX_LIMIT);
  const PER_SOURCE = limit;
  const { role } = await getMyAccess();
  if (role !== "admin" && role !== "office") return { ok: false, error: "Notifikasi hanya untuk admin dan Office." };
  if (!isAdminApiConfigured) return { ok: false, error: "SUPABASE_SECRET_KEY belum diatur di server." };

  const db = createServiceClient();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const att = "id, attendance_date, check_in_at, check_out_at, check_in_wfa, check_out_wfa, employee:employee_id(full_name), branch:branch_id(code)";

  const [ins, outs, kasbon, backups, offs] = await Promise.all([
    db.from("attendance_daily").select(att).gte("check_in_at", since).order("check_in_at", { ascending: false }).limit(PER_SOURCE),
    db.from("attendance_daily").select(att).gte("check_out_at", since).order("check_out_at", { ascending: false }).limit(PER_SOURCE),
    db
      .from("kasbon")
      .select("id, amount, requested_at, status, employee:employee_id(full_name)")
      .gte("requested_at", since)
      .order("requested_at", { ascending: false })
      .limit(PER_SOURCE),
    db
      .from("employee_backup")
      .select("id, created_at, date_from, date_to, employee:employee_id(full_name), to_branch:to_branch_id(code)")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(PER_SOURCE),
    // Pengajuan libur (tabel ada setelah migrasi day_off; error diabaikan bila belum)
    db
      .from("day_off")
      .select("id, off_date, kind, status, requested_at, replaces_id, employee:employee_id(full_name)")
      .gte("requested_at", since)
      .order("requested_at", { ascending: false })
      .limit(PER_SOURCE),
  ]);

  type Att = {
    id: number;
    attendance_date: string;
    check_in_at: string | null;
    check_out_at: string | null;
    check_in_wfa?: boolean;
    check_out_wfa?: boolean;
    employee: { full_name: string } | null;
    branch: { code: string } | null;
  };
  const items: AppNotification[] = [];
  const rupiah = (n: number) => `Rp${new Intl.NumberFormat("id-ID").format(n)}`;

  for (const r of (ins.data ?? []) as unknown as Att[]) {
    if (!r.check_in_at) continue;
    items.push({
      id: `in-${r.id}`,
      kind: "check_in",
      at: r.check_in_at,
      title: `${r.employee?.full_name ?? "Karyawan"} check in`,
      detail: `${r.branch?.code ?? "-"} · ${formatTimeWIB(r.check_in_at)}${r.check_in_wfa ? " · WFA" : ""}`,
      href: `/absensi?tanggal=${r.attendance_date}`,
    });
  }
  for (const r of (outs.data ?? []) as unknown as Att[]) {
    if (!r.check_out_at) continue;
    items.push({
      id: `out-${r.id}`,
      kind: "check_out",
      at: r.check_out_at,
      title: `${r.employee?.full_name ?? "Karyawan"} check out`,
      detail: `${r.branch?.code ?? "-"} · ${formatTimeWIB(r.check_out_at)}${r.check_out_wfa ? " · WFA" : ""}`,
      href: `/absensi?tanggal=${r.attendance_date}`,
    });
  }
  type Kasbon = { id: string; amount: number | string; requested_at: string; status: string; employee: { full_name: string } | null };
  for (const k of (kasbon.data ?? []) as unknown as Kasbon[]) {
    items.push({
      id: `kasbon-${k.id}`,
      kind: "kasbon",
      at: k.requested_at,
      title: `${k.employee?.full_name ?? "Karyawan"} mengajukan kasbon`,
      detail: `${rupiah(Number(k.amount))}${k.status === "diajukan" ? " · menunggu persetujuan" : ` · ${k.status}`}`,
      href: "/kasbon",
    });
  }
  type Backup = { id: string; created_at: string; date_from: string; date_to: string; employee: { full_name: string } | null; to_branch: { code: string } | null };
  for (const b of (backups.data ?? []) as unknown as Backup[]) {
    items.push({
      id: `backup-${b.id}`,
      kind: "backup",
      at: b.created_at,
      title: `Backup ${b.employee?.full_name ?? "karyawan"} ke ${b.to_branch?.code ?? "-"}`,
      detail: b.date_from === b.date_to ? b.date_from : `${b.date_from} s/d ${b.date_to}`,
      href: "/backup",
    });
  }

  type Off = { id: string; off_date: string; kind: string; status: string; requested_at: string; replaces_id: string | null; employee: { full_name: string } | null };
  for (const o of (offs.error ? [] : (offs.data ?? [])) as unknown as Off[]) {
    items.push({
      id: `libur-${o.id}`,
      kind: "libur",
      at: o.requested_at,
      title: `${o.employee?.full_name ?? "Karyawan"} ${o.replaces_id ? "memindah libur" : "mengajukan libur"}`,
      detail: `${o.off_date}${o.kind === "pengganti" ? " · off pengganti" : ""}${o.status === "diajukan" ? " · menunggu persetujuan" : ` · ${o.status}`}`,
      href: "/libur",
    });
  }

  items.sort((a, b) => b.at.localeCompare(a.at));
  return { ok: true, items: items.slice(0, limit), canOpen: role === "admin" };
}
