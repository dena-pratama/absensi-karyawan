import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageBody, PageHeader } from "@/components/shell/page-layout";
import { getMyAccess } from "@/lib/data/access";
import { getPayrollSettings } from "@/lib/data/kasbon";
import { getReportOptions } from "@/lib/data/report";
import { SettingsSkeleton } from "../../pengaturan/_components/settings-skeleton";
import { KasbonTabs } from "../_components/kasbon-tabs";
import { PayrollManager } from "./payroll-manager";

export const metadata: Metadata = { title: "Pengaturan Kasbon" };

export default function PengaturanKasbonPage() {
  return (
    <>
      <PageHeader
        crumb="Kasbon"
        current="Pengaturan Kasbon"
        title="Gaji Pokok & Aturan Plafon Kasbon"
        below={<KasbonTabs active="pengaturan" isAdmin />}
      />
      <PageBody>
        <Suspense fallback={<SettingsSkeleton />}>
          <Content />
        </Suspense>
      </PageBody>
    </>
  );
}

async function Content() {
  // Proxy sudah membatasi halaman ini untuk admin; cek lagi di server.
  if ((await getMyAccess()).role !== "admin") redirect("/kasbon");
  const [settings, options] = await Promise.all([getPayrollSettings(), getReportOptions()]);
  return <PayrollManager settings={settings} employees={options.employees} />;
}
