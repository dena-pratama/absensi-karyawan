import { Suspense } from "react";
import { PageHeader } from "@/components/shell/page-layout";
import { getSettingsCounts } from "@/lib/data/settings";
import { BranchCrumb } from "@/components/shell/branch-crumb";
import { SettingsTabs, type SettingsTab } from "./settings-tabs";

async function TabsWithCounts({ active }: { active: SettingsTab }) {
  const counts = await getSettingsCounts();
  return <SettingsTabs active={active} counts={counts} />;
}

/** Header bersama 3 halaman Pengaturan. */
export function SettingsHeader({ tab }: { tab: SettingsTab }) {
  return (
    <PageHeader
      crumb={<BranchCrumb />}
      current="Pengaturan & Master Data Hub"
      title="Pengaturan Operasional & Master Data"
      below={
        <>
          <p className="text-xs text-gray-400 mt-1">
            Kelola data karyawan &amp; penempatan, cabang / hub, master jabatan, dan hak akses pengguna. Perubahan disimpan saat klik
            &quot;Terapkan Pengaturan&quot;.
          </p>
          <Suspense fallback={<SettingsTabs active={tab} counts={null} />}>
            <TabsWithCounts active={tab} />
          </Suspense>
        </>
      }
    />
  );
}
