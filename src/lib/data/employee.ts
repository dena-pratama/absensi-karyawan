import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { BranchType } from "@/lib/labels";

export type EmployeeDetail = {
  id: string;
  nik: string;
  name: string;
  phone: string | null;
  contract: "tetap" | "pkwt" | "mitra";
  joinDate: string | null;
  isActive: boolean;
  assignment: {
    validFrom: string;
    branch: { code: string; name: string; type: BranchType };
    role: string;
  } | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Row = {
  id: string;
  nik: string;
  full_name: string;
  phone_wa: string | null;
  contract_type: EmployeeDetail["contract"];
  join_date: string | null;
  is_active: boolean;
  employee_assignment: {
    valid_from: string;
    valid_to: string | null;
    branch: { code: string; name: string; branch_type: BranchType } | null;
    job_role: { name: string } | null;
  }[];
};

/** Biodata karyawan + penempatan aktif. null kalau tidak ditemukan. */
export async function getEmployeeDetail(id: string): Promise<EmployeeDetail | null> {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee")
    .select(
      "id, nik, full_name, phone_wa, contract_type, join_date, is_active, employee_assignment(valid_from, valid_to, branch:branch_id(code, name, branch_type), job_role:job_role_id(name))",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Gagal memuat karyawan: ${error.message}`);
  if (!data) return null;

  const row = data as unknown as Row;
  const active = row.employee_assignment.find((a) => a.valid_to === null);
  return {
    id: row.id,
    nik: row.nik,
    name: row.full_name,
    phone: row.phone_wa,
    contract: row.contract_type,
    joinDate: row.join_date,
    isActive: row.is_active,
    assignment:
      active && active.branch
        ? {
            validFrom: active.valid_from,
            branch: { code: active.branch.code, name: active.branch.name, type: active.branch.branch_type },
            role: active.job_role?.name ?? "-",
          }
        : null,
  };
}
