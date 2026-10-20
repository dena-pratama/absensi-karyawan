import { PageHeader, UnderlineTabs } from "@/components/shell/page-layout";
import { BranchCrumb } from "@/components/shell/branch-crumb";

export type AbsensiTab = "karyawan" | "harian" | "rekap";

const TABS: { key: AbsensiTab; label: string; href: string }[] = [
  { key: "karyawan", label: "Daftar Karyawan", href: "/absensi/karyawan" },
  { key: "harian", label: "Absensi Harian", href: "/absensi" },
  { key: "rekap", label: "Rekap Bulanan", href: "/absensi/rekap" },
];

/** Header bersama 3 halaman di menu Absensi (tab di bawah judul). */
export function AbsensiHeader({ tab, title }: { tab: AbsensiTab; title: string }) {
  const current = TABS.find((t) => t.key === tab)!;
  return (
    <PageHeader
      crumb={<BranchCrumb />}
      current={current.label}
      title={title}
      below={<UnderlineTabs items={TABS.map((t) => ({ ...t, active: t.key === tab }))} />}
    />
  );
}
