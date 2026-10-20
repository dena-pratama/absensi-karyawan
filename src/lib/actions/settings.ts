"use server";

import { revalidatePath } from "next/cache";
import type { BranchSetting, EmployeeSetting, RoleSetting } from "@/lib/data/settings";
import { BRANCH_TYPE_LABEL, CODE_MAX, type BranchType } from "@/lib/labels";
import { parseDateParam, todayWIB } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export type ApplyResult = { ok: true; applied: number } | { ok: false; error: string; applied: number };

/** Baris baru dari client memakai id sementara berawalan "new-". */
const isNew = (id: string) => id.startsWith("new-");

function friendly(error: { code?: string; message: string }, context: string) {
  if (error.code === "23505") return `${context}: data sudah terdaftar (kode/NIK duplikat).`;
  if (error.code === "23514") return `${context}: format data tidak valid.`;
  if (error.code === "23503") return `${context}: data terkait tidak ditemukan.`;
  return `${context}: gagal disimpan.`;
}

function yesterday(ymd: string) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/* --------------------------------- Karyawan --------------------------------- */

const validCode = (v: string) => v.trim().length > 0 && v.trim().length <= CODE_MAX;
const PHONE_RE = /^[0-9]{9,12}$/;
const CONTRACTS = ["tetap", "pkwt", "mitra"];

function validateEmployee(e: EmployeeSetting): string | null {
  if (!validCode(e.nik)) return `NIK "${e.nik}" wajib diisi (maks. ${CODE_MAX} karakter).`;
  if (!e.name.trim()) return `Nama karyawan ${e.nik} wajib diisi.`;
  if (e.phone && !PHONE_RE.test(e.phone)) return `No. WhatsApp ${e.nik} harus 9–12 digit setelah +62.`;
  if (!CONTRACTS.includes(e.contract)) return `Status kontrak ${e.nik} tidak valid.`;
  if (e.joinDate && parseDateParam(e.joinDate, "") !== e.joinDate) return `Tanggal bergabung ${e.nik} tidak valid.`;
  if (!e.branchId || !e.roleId) return `Cabang dan jabatan ${e.nik} wajib dipilih.`;
  return null;
}

function employeeColumns(e: EmployeeSetting) {
  return {
    nik: e.nik.trim(),
    full_name: e.name.trim(),
    phone_wa: e.phone ? `+62${e.phone}` : null,
    contract_type: e.contract,
    join_date: e.joinDate || null,
    is_active: e.isActive,
  };
}

/**
 * Terapkan perubahan karyawan sekaligus.
 * Ganti cabang/jabatan = mutasi: penempatan lama ditutup kemarin, penempatan baru mulai hari ini
 * (kalau penempatan lama baru dibuat hari ini, cukup diperbarui).
 */
export async function applyEmployeeChanges(rows: EmployeeSetting[]): Promise<ApplyResult> {
  for (const r of rows) {
    const err = validateEmployee(r);
    if (err) return { ok: false, error: err, applied: 0 };
  }
  const supabase = await createClient();
  const today = todayWIB();
  let applied = 0;

  const fail = (error: string) => {
    revalidatePath("/", "layout");
    return { ok: false as const, error, applied };
  };

  for (const r of rows) {
    const label = `Karyawan ${r.nik}`;
    if (isNew(r.id)) {
      const { data, error } = await supabase.from("employee").insert(employeeColumns(r)).select("id").single();
      if (error) return fail(friendly(error, label));
      const { error: aErr } = await supabase
        .from("employee_assignment")
        .insert({ employee_id: data.id, branch_id: r.branchId, job_role_id: r.roleId, valid_from: r.joinDate || today });
      if (aErr) return fail(friendly(aErr, `Penempatan ${r.nik}`));
      applied++;
      continue;
    }

    const { error } = await supabase.from("employee").update(employeeColumns(r)).eq("id", r.id);
    if (error) return fail(friendly(error, label));

    const { data: current, error: cErr } = await supabase
      .from("employee_assignment")
      .select("id, branch_id, job_role_id, valid_from")
      .eq("employee_id", r.id)
      .is("valid_to", null)
      .maybeSingle();
    if (cErr) return fail(friendly(cErr, `Penempatan ${r.nik}`));

    const changed = !current || current.branch_id !== r.branchId || current.job_role_id !== r.roleId;
    if (changed) {
      if (current && current.valid_from >= today) {
        const { error: uErr } = await supabase
          .from("employee_assignment")
          .update({ branch_id: r.branchId, job_role_id: r.roleId })
          .eq("id", current.id);
        if (uErr) return fail(friendly(uErr, `Mutasi ${r.nik}`));
      } else {
        if (current) {
          const { error: closeErr } = await supabase
            .from("employee_assignment")
            .update({ valid_to: yesterday(today) })
            .eq("id", current.id);
          if (closeErr) return fail(friendly(closeErr, `Mutasi ${r.nik}`));
        }
        const { error: insErr } = await supabase
          .from("employee_assignment")
          .insert({ employee_id: r.id, branch_id: r.branchId, job_role_id: r.roleId, valid_from: today });
        if (insErr) return fail(friendly(insErr, `Mutasi ${r.nik}`));
      }
    }

    // Tanggal bergabung dimundurkan → penempatan pertama ikut mundur, supaya absensi
    // tanggal-tanggal itu bisa diisi. Hanya dimundurkan, tidak pernah dimajukan,
    // agar absensi yang sudah tercatat tidak hilang dari roster.
    if (r.joinDate) {
      const { data: first, error: fErr } = await supabase
        .from("employee_assignment")
        .select("id, valid_from, valid_to")
        .eq("employee_id", r.id)
        .order("valid_from")
        .limit(1)
        .maybeSingle();
      if (fErr) return fail(friendly(fErr, `Penempatan ${r.nik}`));
      if (first && r.joinDate < first.valid_from) {
        const { error: jErr } = await supabase
          .from("employee_assignment")
          .update({ valid_from: r.joinDate })
          .eq("id", first.id);
        if (jErr) return fail(friendly(jErr, `Tanggal bergabung ${r.nik}`));
      }
    }
    applied++;
  }

  revalidatePath("/", "layout");
  return { ok: true, applied };
}

/* --------------------------------- Cabang --------------------------------- */

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function validateBranch(b: BranchSetting): string | null {
  if (!validCode(b.code)) return `Kode cabang "${b.code}" wajib diisi (maks. ${CODE_MAX} karakter).`;
  if (!b.name.trim()) return `Nama cabang ${b.code} wajib diisi.`;
  if (!(b.type in BRANCH_TYPE_LABEL)) return `Tipe cabang ${b.code} tidak valid.`;
  if (!b.is24 && (!TIME_RE.test(b.open) || !TIME_RE.test(b.close))) return `Jam gate ${b.code} wajib diisi (atau pilih 24 jam).`;
  return null;
}

function branchColumns(b: BranchSetting) {
  return {
    code: b.code.trim(),
    name: b.name.trim(),
    branch_type: b.type as BranchType,
    cluster_id: b.clusterId || null,
    address: b.address.trim() || null,
    pic_employee_id: b.picId || null,
    is_24_hours: b.is24,
    gate_open_time: b.is24 ? null : b.open,
    gate_close_time: b.is24 ? null : b.close,
    // Toggle hanya Aktif/Nonaktif; status "maintenance" lama dipertahankan selama tetap aktif.
    status: b.active ? (b.originalStatus === "maintenance" ? "maintenance" : "aktif") : "nonaktif",
  };
}

export async function applyBranchChanges(rows: BranchSetting[]): Promise<ApplyResult> {
  for (const r of rows) {
    const err = validateBranch(r);
    if (err) return { ok: false, error: err, applied: 0 };
  }
  const supabase = await createClient();
  let applied = 0;
  for (const r of rows) {
    const query = isNew(r.id)
      ? supabase.from("branch").insert(branchColumns(r))
      : supabase.from("branch").update(branchColumns(r)).eq("id", r.id);
    const { error } = await query;
    if (error) {
      revalidatePath("/", "layout");
      return { ok: false, error: friendly(error, `Cabang ${r.code}`), applied };
    }
    applied++;
  }
  revalidatePath("/", "layout");
  return { ok: true, applied };
}

/* --------------------------------- Jabatan --------------------------------- */

const ROLE_CODE_RE = /^[A-Z][A-Z0-9_]{1,29}$/;

export async function applyRoleChanges(rows: RoleSetting[]): Promise<ApplyResult> {
  for (const r of rows) {
    if (!ROLE_CODE_RE.test(r.code.trim().toUpperCase()))
      return { ok: false, error: `Kode jabatan "${r.code}" hanya huruf besar, angka, dan _ (cth: DRIVER_CDD).`, applied: 0 };
    if (!r.name.trim()) return { ok: false, error: `Nama jabatan ${r.code} wajib diisi.`, applied: 0 };
  }
  const supabase = await createClient();
  let applied = 0;
  for (const r of rows) {
    const cols = { code: r.code.trim().toUpperCase(), name: r.name.trim(), is_active: r.isActive };
    const query = isNew(r.id)
      ? supabase.from("job_role").insert(cols)
      : supabase.from("job_role").update(cols).eq("id", r.id);
    const { error } = await query;
    if (error) {
      revalidatePath("/", "layout");
      return { ok: false, error: friendly(error, `Jabatan ${r.code}`), applied };
    }
    applied++;
  }
  revalidatePath("/", "layout");
  return { ok: true, applied };
}
