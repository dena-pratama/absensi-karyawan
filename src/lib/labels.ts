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

/** Hari dalam minggu (sama dengan Date.getUTCDay / kolom employee.day_off_weekdays): 0 Minggu ... 6 Sabtu. */
export const WEEKDAY_LABEL = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"] as const;
export const WEEKDAY_SHORT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"] as const;
/** Urutan tampil: Senin dulu. */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

/** Role akun login (lihat migrasi role_based_rls & office_role). */
export type AppRole = "admin" | "spv" | "office" | "karyawan";

/** Urutan tingkatan: Admin > Office > SPV > Karyawan. */
export const APP_ROLE_LABEL: Record<AppRole, string> = {
  admin: "Admin",
  office: "Office",
  spv: "SPV Cabang",
  karyawan: "Karyawan",
};

export const APP_ROLES = Object.keys(APP_ROLE_LABEL) as AppRole[];

/** Role yang memilih cabang yang dipegang (SPV). Office otomatis memegang semua cabang. */
export const holdsBranches = (role: AppRole | "" | null | undefined): role is "spv" => role === "spv";

/** Role yang bisa dihubungkan ke data karyawan untuk absen sendiri lewat app (selain karyawan). */
export const attendsSelf = (role: AppRole | "" | null | undefined): role is "spv" | "office" => role === "spv" || role === "office";

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

/** Kalimat yang harus diketik untuk konfirmasi Reset Data (sama dengan fungsi admin_reset_data). */
export const RESET_PHRASE = "RESET DATABASE";
