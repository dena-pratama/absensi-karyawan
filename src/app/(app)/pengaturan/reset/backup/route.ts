import { isAdmin } from "@/lib/data/access";
import { todayWIB } from "@/lib/format";
import { createAdminAuthClient, createServiceClient, isAdminApiConfigured } from "@/lib/supabase/admin";

/** Tabel yang dibackup (urutan = urutan pemulihan yang aman). Kolom rahasia tidak ikut. */
const TABLES: { name: string; columns?: string }[] = [
  { name: "cluster" },
  { name: "job_role" },
  { name: "branch" },
  { name: "employee" },
  { name: "employee_assignment" },
  { name: "app_user" },
  { name: "app_user_branch" },
  { name: "employee_backup" },
  { name: "attendance_daily" },
  { name: "payroll_setting" },
  { name: "job_role_salary" },
  { name: "employee_salary" },
  { name: "kasbon" },
  { name: "ai_insight" },
  { name: "audit_log" },
  // API key terenkripsi tidak ikut dibackup
  { name: "ai_connector", columns: "provider, model, base_url, is_active, updated_at" },
];
const PAGE = 1000;

/**
 * GET /pengaturan/reset/backup → unduh semua data sebagai satu file JSON (khusus admin).
 * Dibaca lewat secret key supaya lengkap (tidak terpotong RLS). Foto storage tidak ikut,
 * hanya path-nya (kolom check_in_photo / proof_photo).
 */
export async function GET() {
  if (!(await isAdmin())) return new Response("Hanya admin.", { status: 403 });
  if (!isAdminApiConfigured) return new Response("SUPABASE_SECRET_KEY belum diatur di server.", { status: 500 });

  const db = createServiceClient();
  const tables: Record<string, unknown[]> = {};
  const missing: string[] = [];
  for (const t of TABLES) {
    const rows: unknown[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await db.from(t.name).select(t.columns ?? "*").range(from, from + PAGE - 1);
      if (error) {
        missing.push(t.name);
        break;
      }
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }
    tables[t.name] = rows;
  }

  // Daftar akun login (tanpa kata sandi)
  const users: { id: string; email: string | undefined; created_at: string }[] = [];
  const auth = createAdminAuthClient();
  for (let page = 1; ; page++) {
    const { data, error } = await auth.listUsers({ page, perPage: 1000 });
    if (error) break;
    users.push(...data.users.map((u) => ({ id: u.id, email: u.email, created_at: u.created_at })));
    if (data.users.length < 1000) break;
  }

  const now = new Date();
  const stamp = `${todayWIB()}_${now.toLocaleTimeString("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" }).replace(":", "")}`;
  const body = JSON.stringify(
    { app: "Absensi Ekspedisi", exported_at: now.toISOString(), note: "Backup sebelum reset data. Foto storage tidak ikut.", missing_tables: missing, auth_users: users, tables },
    null,
    2,
  );
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="backup-absensi_${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
