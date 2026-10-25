import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageBody, PageHeader } from "@/components/shell/page-layout";
import { getNotifications } from "@/lib/actions/notifications";
import { getMyAccess } from "@/lib/data/access";
import { SettingsSkeleton } from "../pengaturan/_components/settings-skeleton";
import { NotificationList } from "./notification-list";

export const metadata: Metadata = { title: "Notifikasi" };

const RANGES = [3, 7, 14, 30] as const;

export default function NotifikasiPage({ searchParams }: PageProps<"/notifikasi">) {
  return (
    <>
      <PageHeader crumb="Absensi Ekspedisi" current="Notifikasi" title="Riwayat Aktivitas & Notifikasi" />
      <PageBody>
        <Suspense fallback={<SettingsSkeleton />}>
          <Content searchParams={searchParams} />
        </Suspense>
      </PageBody>
    </>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/notifikasi">["searchParams"] }) {
  const [{ role }, params] = await Promise.all([getMyAccess(), searchParams]);
  if (role !== "admin" && role !== "office") redirect("/");
  const asked = Number(params.hari);
  const days = (RANGES as readonly number[]).includes(asked) ? asked : 7;
  const res = await getNotifications({ days, limit: 500 });
  return <NotificationList result={res} days={days} ranges={[...RANGES]} />;
}
