import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageBody, PageHeader } from "@/components/shell/page-layout";
import { getMyAccess } from "@/lib/data/access";
import { getDayOffPage } from "@/lib/data/day-off";
import { todayWIB } from "@/lib/format";
import { SettingsSkeleton } from "../pengaturan/_components/settings-skeleton";
import { LiburTabs } from "./_components/libur-tabs";
import { DayOffManager } from "./day-off-manager";

export const metadata: Metadata = { title: "Libur Karyawan" };

export default function LiburPage() {
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
      current="Libur Karyawan"
      title="Jadwal Libur & Tukar Off"
      below={<LiburTabs active="jadwal" isAdmin={isAdmin} />}
    />
  );
}

async function RoleHeader() {
  const { role } = await getMyAccess();
  return <Header isAdmin={role === "admin"} />;
}

async function Content() {
  await connection();
  const { role } = await getMyAccess();
  if (role !== "admin" && role !== "office") redirect("/");
  return <DayOffManager data={await getDayOffPage()} today={todayWIB()} />;
}
