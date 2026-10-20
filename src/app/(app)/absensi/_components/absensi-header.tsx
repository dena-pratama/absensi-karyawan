import { Suspense } from "react";
import { PageHeader, UnderlineTabs } from "@/components/shell/page-layout";
import { getShellData } from "@/lib/data/shell";

export type AbsensiTab = "karyawan" | "harian" | "rekap";

const TABS: { key: AbsensiTab; label: string; href: string }[] = [
  { key: "karyawan", label: "Daftar Karyawan", href: "/absensi/karyawan" },
  { key: "harian", label: "Absensi Harian", href: "/absensi" },
  { key: "rekap", label: "Rekap Bulanan", href: "/absensi/rekap" },
];

async function BranchCode() {
  const { activeBranch } = await getShellData();
  return activeBranch?.code ?? "—";
}

/** Header bersama 3 halaman di menu Absensi (tab di bawah judul). */
export function AbsensiHeader({ tab, title }: { tab: AbsensiTab; title: string }) {
  const current = TABS.find((t) => t.key === tab)!;
  return (
    <PageHeader
      crumb={
        <Suspense fallback="…">
          <BranchCode />
        </Suspense>
      }
      current={current.label}
      title={title}
      below={<UnderlineTabs items={TABS.map((t) => ({ ...t, active: t.key === tab }))} />}
    />
  );
}
