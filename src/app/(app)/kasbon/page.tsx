import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageBody, PageHeader } from "@/components/shell/page-layout";
import { getMyAccess } from "@/lib/data/access";
import { getKasbonPage } from "@/lib/data/kasbon";
import { todayWIB } from "@/lib/format";
import { SettingsSkeleton } from "../pengaturan/_components/settings-skeleton";
import { KasbonTabs } from "./_components/kasbon-tabs";
import { KasbonManager } from "./kasbon-manager";

export const metadata: Metadata = { title: "Kasbon" };

export default function KasbonPage() {
  return (
    <>
      <Suspense fallback={<Header isAdmin={false} />}>
        <RoleHeader />
      </Suspense>
      <PageBody>
        <Suspense fallback={<SettingsSkeleton />}>
          <Content />
        </Suspense>
      </PageBody>
    </>
  );
}

function Header({ isAdmin }: { isAdmin: boolean }) {
  return (
    <PageHeader
      crumb="Absensi Ekspedisi"
      current="Kasbon"
      title={isAdmin ? "Pengajuan & Pencairan Kasbon" : "Kasbon Saya"}
      below={<KasbonTabs active="pengajuan" isAdmin={isAdmin} />}
    />
  );
}

async function RoleHeader() {
  const { role } = await getMyAccess();
  return <Header isAdmin={role === "admin"} />;
}

async function Content() {
  await connection(); // periode & status lunas otomatis bergantung tanggal hari ini
  const data = await getKasbonPage();
  return <KasbonManager data={data} today={todayWIB()} />;
}
