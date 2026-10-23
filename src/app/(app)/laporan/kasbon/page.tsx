import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageBody, PageHeader } from "@/components/shell/page-layout";
import { getKasbonReport } from "@/lib/data/kasbon";
import { getReportOptions } from "@/lib/data/report";
import { SettingsSkeleton } from "../../pengaturan/_components/settings-skeleton";
import { LaporanTabs } from "../_components/laporan-tabs";
import { KasbonReport } from "./kasbon-report";

export const metadata: Metadata = { title: "Laporan Kasbon" };

export default function LaporanKasbonPage() {
  return (
    <>
      <PageHeader
        crumb="Absensi Ekspedisi"
        current="Laporan Kasbon"
        title="Rekap Kasbon Karyawan"
        below={<LaporanTabs active="kasbon" />}
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
  await connection(); // periode berjalan & status lunas otomatis bergantung tanggal hari ini
  const [report, options] = await Promise.all([getKasbonReport(), getReportOptions()]);
  return <KasbonReport report={report} branches={options.branches} employees={options.employees} />;
}
