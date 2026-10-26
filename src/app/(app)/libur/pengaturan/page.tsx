import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageBody, PageHeader } from "@/components/shell/page-layout";
import { getMyAccess } from "@/lib/data/access";
import { getDayOffSettings } from "@/lib/data/day-off";
import { getReportOptions } from "@/lib/data/report";
import { SettingsSkeleton } from "../../pengaturan/_components/settings-skeleton";
import { LiburTabs } from "../_components/libur-tabs";
import { DayOffSettingsForm } from "./day-off-settings";

export const metadata: Metadata = { title: "Pengaturan Jatah Libur" };

export default function PengaturanLiburPage() {
  return (
    <>
      <PageHeader crumb="Libur Karyawan" current="Pengaturan Jatah" title="Jatah Libur per Periode Gajian" below={<LiburTabs active="pengaturan" isAdmin />} />
      <PageBody>
        <Suspense fallback={<SettingsSkeleton />}>
          <Content />
        </Suspense>
      </PageBody>
    </>
  );
}

async function Content() {
  if ((await getMyAccess()).role !== "admin") redirect("/libur");
  const [settings, options] = await Promise.all([getDayOffSettings(), getReportOptions()]);
  return <DayOffSettingsForm settings={settings} employees={options.employees} />;
}
