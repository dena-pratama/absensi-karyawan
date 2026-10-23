export type BranchType =
  | "hub_utama"
  | "transit_center"
  | "sub_hub"
  | "drop_point"
  | "dc_sorting"
  | "gateway"
  | "sub_agent";

export const BRANCH_TYPE_LABEL: Record<BranchType, string> = {
  hub_utama: "Hub Utama",
  transit_center: "Transit Center",
  sub_hub: "Sub-Hub",
  drop_point: "Drop Point / Outlet",
  dc_sorting: "DC Sorting Center",
  gateway: "Gateway",
  sub_agent: "Sub-Agent",
};

export type AttendanceStatus = "hadir" | "sakit" | "tidak_hadir";

export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  hadir: "Hadir",
  sakit: "Sakit",
  tidak_hadir: "Tidak Hadir",
};

/** Kode cabang & NIK karyawan bebas format (huruf, angka, simbol, spasi): wajib diisi, maks. 30 karakter. */
export const CODE_MAX = 30;

/** Role akun login (lihat migrasi role_based_rls). */
export type AppRole = "admin" | "spv" | "karyawan";

export const APP_ROLE_LABEL: Record<AppRole, string> = {
  admin: "Admin",
  spv: "SPV Cabang",
  karyawan: "Karyawan",
};

/** Status kasbon (lihat migrasi kasbon). */
export type KasbonStatus = "diajukan" | "disetujui" | "ditolak" | "dicairkan" | "lunas" | "dibatalkan";

export const KASBON_STATUS_LABEL: Record<KasbonStatus, string> = {
  diajukan: "Diajukan",
  disetujui: "Disetujui",
  ditolak: "Ditolak",
  dicairkan: "Dicairkan",
  lunas: "Lunas",
  dibatalkan: "Dibatalkan",
};
