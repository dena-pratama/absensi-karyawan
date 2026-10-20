import type { Metadata } from "next";
import { Suspense } from "react";
import { PageBody } from "@/components/shell/page-layout";
import { getBranchSettings, getEmployeeSettings, getRoleSettings } from "@/lib/data/settings";
import { SettingsHeader } from "./_components/settings-header";
import { SettingsSkeleton } from "./_components/settings-skeleton";
import { EmployeeManager } from "./employee-manager";

export const metadata: Metadata = { title: "Manajemen Karyawan" };

export default function PengaturanKaryawanPage() {
  return (
    <>
      <SettingsHeader tab="karyawan" />
      <PageBody>
        <Suspense fallback={<SettingsSkeleton />}>
          <Content />
        </Suspense>
      </PageBody>
    </>
  );
}

async function Content() {
  const [employees, { branches }, roles] = await Promise.all([getEmployeeSettings(), getBranchSettings(), getRoleSettings()]);
  return <EmployeeManager employees={employees} branches={branches} roles={roles} />;
}
