import type { Metadata } from "next";
import { Suspense } from "react";
import { PageBody } from "@/components/shell/page-layout";
import { getEmployeeSettings, getRoleSettings } from "@/lib/data/settings";
import { SettingsHeader } from "../_components/settings-header";
import { SettingsSkeleton } from "../_components/settings-skeleton";
import { RoleManager } from "./role-manager";

export const metadata: Metadata = { title: "Master Jabatan" };

export default function PengaturanJabatanPage() {
  return (
    <>
      <SettingsHeader tab="jabatan" />
      <PageBody>
        <Suspense fallback={<SettingsSkeleton />}>
          <Content />
        </Suspense>
      </PageBody>
    </>
  );
}

async function Content() {
  const [roles, employees] = await Promise.all([getRoleSettings(), getEmployeeSettings()]);
  const activeEmployees = employees.filter((e) => e.isActive);
  return (
    <RoleManager
      roles={roles}
      activeEmployees={activeEmployees.length}
      mappedEmployees={activeEmployees.filter((e) => e.roleId).length}
    />
  );
}
