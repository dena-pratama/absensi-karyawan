"use server";

import { revalidatePath } from "next/cache";
import { getDayRoster } from "@/lib/data/backup";
import { parseDateParam, todayWIB } from "@/lib/format";
import type { AttendanceStatus } from "@/lib/labels";
import { READ_ONLY_ERROR, isAdmin } from "@/lib/data/access";
import { createClient } from "@/lib/supabase/server";

export type AttendanceChange = {
  employeeId: string;
  status: AttendanceStatus;
  note: string;
};

export type SaveResult = { ok: true; saved: number } | { ok: false; error: string };

const STATUSES: AttendanceStatus[] = ["hadir", "sakit", "tidak_hadir"];
const NOTE_MAX = 200;

/**
 * Simpan ceklis harian untuk satu cabang & tanggal.
 * Hanya baris yang berubah yang dikirim dari client. Cabang & jabatan
 * disimpan sebagai snapshot dari penempatan karyawan pada tanggal itu.
 */
export async function saveAttendance(
  branchId: string,
  date: string,
  changes: AttendanceChange[],
): Promise<SaveResult> {
  if (!(await isAdmin())) return { ok: false, error: READ_ONLY_ERROR };
  const today = todayWIB();
  if (parseDateParam(date, "") !== date) return { ok: false, error: "Tanggal tidak valid." };
  if (date > today) return { ok: false, error: "Tidak bisa mengisi absensi untuk tanggal yang akan datang." };
  if (changes.length === 0) return { ok: true, saved: 0 };

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return { ok: false, error: "Sesi berakhir. Silakan masuk kembali." };

  // Karyawan yang sedang backup di cabang lain diabsen di cabang tujuan, bukan di sini.
  const roster = new Map(
    (await getDayRoster(branchId, date)).filter((r) => r.backup?.kind !== "out").map((r) => [r.employeeId, r]),
  );

  const rows = [];
  for (const c of changes) {
    const emp = roster.get(c.employeeId);
    if (!emp) return { ok: false, error: "Ada karyawan yang tidak terdaftar di cabang ini pada tanggal tersebut." };
    if (!STATUSES.includes(c.status)) return { ok: false, error: "Status absensi tidak valid." };
    const note = c.note.trim().slice(0, NOTE_MAX);
    rows.push({
      attendance_date: date,
      employee_id: c.employeeId,
      branch_id: branchId,
      job_role_id: emp.roleId,
      status: c.status,
      note: note || null,
      updated_by: userId,
    });
  }

  // created_by hanya diisi untuk baris baru; baris lama cukup diperbarui.
  const { data: existing, error: existingError } = await supabase
    .from("attendance_daily")
    .select("employee_id")
    .eq("attendance_date", date)
    .in(
      "employee_id",
      rows.map((r) => r.employee_id),
    );
  if (existingError) return { ok: false, error: "Gagal membaca data absensi." };

  const existingIds = new Set((existing ?? []).map((e) => e.employee_id as string));
  const toInsert = rows.filter((r) => !existingIds.has(r.employee_id)).map((r) => ({ ...r, created_by: userId }));
  const toUpdate = rows.filter((r) => existingIds.has(r.employee_id));

  if (toInsert.length) {
    const { error } = await supabase.from("attendance_daily").insert(toInsert);
    if (error) return { ok: false, error: "Gagal menyimpan absensi baru." };
  }
  if (toUpdate.length) {
    const { error } = await supabase
      .from("attendance_daily")
      .upsert(toUpdate, { onConflict: "employee_id,attendance_date" });
    if (error) return { ok: false, error: "Gagal memperbarui absensi." };
  }

  revalidatePath("/", "layout");
  return { ok: true, saved: rows.length };
}
