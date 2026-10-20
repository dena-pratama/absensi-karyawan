import "server-only";
import { formatTimeWIB } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

/** Bucket privat foto selfie (migrasi attendance_check_in_out). */
const SELFIE_BUCKET = "attendance-selfie";
/** Masa berlaku link foto (detik). */
const PHOTO_URL_TTL = 60 * 60;

/** Satu kali absen mandiri dari app mobile (masuk atau pulang). */
export type CheckPoint = {
  at: string; // ISO
  time: string; // "08:15 WIB"
  lat: number | null;
  lng: number | null;
  distanceM: number | null;
  accuracyM: number | null;
  photoUrl: string | null; // signed URL, null bila foto tidak bisa dibuka
};

export type CheckDetail = { in: CheckPoint | null; out: CheckPoint | null };

type Row = {
  employee_id: string;
  check_in_at: string | null;
  check_in_lat: number | null;
  check_in_lng: number | null;
  check_in_accuracy_m: number | null;
  check_in_distance_m: number | null;
  check_in_photo: string | null;
  check_out_at: string | null;
  check_out_lat: number | null;
  check_out_lng: number | null;
  check_out_accuracy_m: number | null;
  check_out_distance_m: number | null;
  check_out_photo: string | null;
};

const COLUMNS =
  "employee_id, check_in_at, check_in_lat, check_in_lng, check_in_accuracy_m, check_in_distance_m, check_in_photo, " +
  "check_out_at, check_out_lat, check_out_lng, check_out_accuracy_m, check_out_distance_m, check_out_photo";

/**
 * Detail check in / out (jam, GPS, selfie) per karyawan untuk satu tanggal.
 * ready=false bila kolomnya belum ada (migrasi attendance_check_in_out belum dijalankan).
 * Foto dibuka lewat signed URL berumur 1 jam; RLS storage tetap berlaku.
 */
export async function getCheckDetails(
  employeeIds: string[],
  date: string,
): Promise<{ ready: boolean; byEmployee: Map<string, CheckDetail> }> {
  const byEmployee = new Map<string, CheckDetail>();
  if (employeeIds.length === 0) return { ready: true, byEmployee };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance_daily")
    .select(COLUMNS)
    .in("employee_id", employeeIds)
    .eq("attendance_date", date)
    .or("check_in_at.not.is.null,check_out_at.not.is.null");
  if (error) {
    if (error.code === "42703") return { ready: false, byEmployee }; // kolom belum ada
    throw new Error(`Gagal memuat check in / out: ${error.message}`);
  }
  const rows = (data ?? []) as unknown as Row[];

  const paths = rows.flatMap((r) => [r.check_in_photo, r.check_out_photo]).filter((p): p is string => Boolean(p));
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await supabase.storage.from(SELFIE_BUCKET).createSignedUrls(paths, PHOTO_URL_TTL);
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }

  const point = (
    at: string | null,
    lat: number | null,
    lng: number | null,
    distanceM: number | null,
    accuracyM: number | null,
    photo: string | null,
  ): CheckPoint | null =>
    at ? { at, time: formatTimeWIB(at), lat, lng, distanceM, accuracyM, photoUrl: photo ? (urls.get(photo) ?? null) : null } : null;

  for (const r of rows) {
    byEmployee.set(r.employee_id, {
      in: point(r.check_in_at, r.check_in_lat, r.check_in_lng, r.check_in_distance_m, r.check_in_accuracy_m, r.check_in_photo),
      out: point(r.check_out_at, r.check_out_lat, r.check_out_lng, r.check_out_distance_m, r.check_out_accuracy_m, r.check_out_photo),
    });
  }
  return { ready: true, byEmployee };
}
