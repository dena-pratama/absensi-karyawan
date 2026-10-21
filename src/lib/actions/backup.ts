"use server";

import { revalidatePath } from "next/cache";
import { READ_ONLY_ERROR, isAdmin } from "@/lib/data/access";
import { parseDateParam } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export type BackupInput = {
  id: string | null; // null = baru
  employeeId: string;
  toBranchId: string;
  dateFrom: string;
  dateTo: string;
  note: string;
};

export type BackupResult = { ok: true } | { ok: false; error: string };

const NOTE_MAX = 200;
const MAX_DAYS = 93;

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Pesan dari trigger validasi (tumpang tindih, cabang sama, belum ditempatkan) aman ditampilkan apa adanya. */
function friendly(error: { code?: string; message: string }) {
  if (error.code === "P0001") return error.message;
  if (error.code === "PGRST205" || error.code === "42P01") return "Fitur backup belum aktif. Jalankan migrasi backup_and_multi_branch_spv di Supabase.";
  if (error.code === "23503") return "Karyawan atau cabang tidak ditemukan.";
  if (error.code === "23514") return "Rentang tanggal backup tidak valid (maks. 93 hari).";
  if (error.code === "42501") return "Tidak punya izin mengubah penugasan backup.";
  return "Gagal menyimpan penugasan backup.";
}

/** Tambah / ubah penugasan backup (admin). SPV membuat backup lewat app mobile. */
export async function saveBackup(input: BackupInput): Promise<BackupResult> {
  if (!(await isAdmin())) return { ok: false, error: READ_ONLY_ERROR };
  if (!input.employeeId) return { ok: false, error: "Pilih karyawan." };
  if (!input.toBranchId) return { ok: false, error: "Pilih cabang tujuan." };
  if (parseDateParam(input.dateFrom, "") !== input.dateFrom) return { ok: false, error: "Tanggal mulai tidak valid." };
  if (parseDateParam(input.dateTo, "") !== input.dateTo) return { ok: false, error: "Tanggal selesai tidak valid." };
  if (input.dateTo < input.dateFrom) return { ok: false, error: "Tanggal selesai tidak boleh sebelum tanggal mulai." };
  if (daysBetween(input.dateFrom, input.dateTo) >= MAX_DAYS) return { ok: false, error: `Backup maksimal ${MAX_DAYS} hari. Untuk pindah tetap, gunakan mutasi.` };

  const supabase = await createClient();
  const cols = {
    employee_id: input.employeeId,
    to_branch_id: input.toBranchId,
    date_from: input.dateFrom,
    date_to: input.dateTo,
    note: input.note.trim().slice(0, NOTE_MAX) || null,
  };
  const { error } = input.id
    ? await supabase.from("employee_backup").update(cols).eq("id", input.id)
    : await supabase.from("employee_backup").insert(cols);
  if (error) return { ok: false, error: friendly(error) };

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteBackup(id: string): Promise<BackupResult> {
  if (!(await isAdmin())) return { ok: false, error: READ_ONLY_ERROR };
  const supabase = await createClient();
  const { error } = await supabase.from("employee_backup").delete().eq("id", id);
  if (error) return { ok: false, error: friendly(error) };
  revalidatePath("/", "layout");
  return { ok: true };
}
