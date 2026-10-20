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
