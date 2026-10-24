"use server";

import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/data/access";
import { RESET_PHRASE } from "@/lib/labels";
import { createAdminAuthClient, createServiceClient, isAdminApiConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ResetMode = "transaksi" | "total";
export type ResetResult =
  | { ok: true; counts: Record<string, number>; files: number; usersDeleted: number; sessionsCleared: boolean }
  | { ok: false; error: string };

const BUCKETS = ["attendance-selfie", "kasbon-proof"];

type Service = ReturnType<typeof createServiceClient>;

/** Hapus semua file di bucket (folder per karyawan). Mengembalikan jumlah file terhapus. */
async function emptyBucket(db: Service, bucket: string): Promise<number> {
  let removed = 0;
  for (let round = 0; round < 50; round++) {
    const { data: root, error } = await db.storage.from(bucket).list("", { limit: 1000 });
    if (error || !root?.length) break;
    const paths: string[] = [];
    for (const entry of root) {
      if (entry.id) {
        paths.push(entry.name); // file di root
        continue;
      }
      const { data: files } = await db.storage.from(bucket).list(entry.name, { limit: 1000 });
      for (const f of files ?? []) if (f.id) paths.push(`${entry.name}/${f.name}`);
    }
    if (!paths.length) break;
    for (let i = 0; i < paths.length; i += 100) {
      const { data } = await db.storage.from(bucket).remove(paths.slice(i, i + 100));
      removed += data?.length ?? 0;
    }
  }
  return removed;
}

/**
 * Reset data (khusus admin). Urutan: data di database (satu transaksi, fungsi admin_reset_data),
 * lalu file storage, lalu (reset total) akun login selain admin yang menjalankan.
 */
export async function resetData(mode: ResetMode, confirm: string): Promise<ResetResult> {
  if (!(await isAdmin())) return { ok: false, error: "Hanya admin yang bisa mereset data." };
  if (mode !== "transaksi" && mode !== "total") return { ok: false, error: "Pilihan reset tidak dikenal." };
  if (confirm !== RESET_PHRASE) return { ok: false, error: `Ketik ${RESET_PHRASE} untuk konfirmasi.` };
  if (!isAdminApiConfigured) return { ok: false, error: "SUPABASE_SECRET_KEY belum diatur di server." };

  const supabase = await createClient();
  const [{ data: auth }, { data, error }] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.rpc("admin_reset_data", { p_mode: mode, p_confirm: confirm }),
  ]);
  if (error) {
    if (error.code === "PGRST202") return { ok: false, error: "Jalankan migrasi 20261031000000_reset_data.sql di Supabase dulu." };
    return { ok: false, error: error.code === "P0001" || error.code === "42501" ? error.message : "Reset gagal. Tidak ada data yang dihapus." };
  }
  const result = data as { counts: Record<string, number>; sessions_cleared: boolean };

  const db = createServiceClient();
  let files = 0;
  for (const b of BUCKETS) files += await emptyBucket(db, b).catch(() => 0);

  // Reset total: hapus akun login lain (sesi di HP ikut berakhir)
  let usersDeleted = 0;
  if (mode === "total") {
    const me = auth?.claims?.sub;
    const admin = createAdminAuthClient();
    const ids: string[] = [];
    for (let page = 1; ; page++) {
      const { data: list, error: listError } = await admin.listUsers({ page, perPage: 1000 });
      if (listError) break;
      ids.push(...list.users.map((u) => u.id).filter((id) => id !== me));
      if (list.users.length < 1000) break;
    }
    for (const id of ids) {
      const { error: delError } = await admin.deleteUser(id);
      if (!delError) usersDeleted++;
    }
  }

  revalidatePath("/", "layout");
  return { ok: true, counts: result.counts, files, usersDeleted, sessionsCleared: result.sessions_cleared };
}
