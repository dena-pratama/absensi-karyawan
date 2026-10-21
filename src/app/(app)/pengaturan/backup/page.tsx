import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageBody } from "@/components/shell/page-layout";
import { getBackups } from "@/lib/data/backup";
import { getBranchSettings, getEmployeeSettings } from "@/lib/data/settings";
import { shiftDay, todayWIB } from "@/lib/format";
import { SettingsHeader } from "../_components/settings-header";
import { SettingsSkeleton } from "../_components/settings-skeleton";
import { BackupManager } from "./backup-manager";

export const metadata: Metadata = { title: "Backup Karyawan" };

export default function BackupKaryawanPage() {
  return (
    <>
      <SettingsHeader tab="backup" />
      <PageBody>
        <Suspense fallback={<SettingsSkeleton />}>
          <Content />
        </Suspense>
      </PageBody>
    </>
  );
}

/** Riwayat yang dimuat: 90 hari ke belakang + semua yang akan datang. */
const HISTORY_DAYS = 90;

async function Content() {
  await connection(); // tanggal hari ini = data request-time
  const today = todayWIB();
  const [{ ready, rows }, employees, { branches }] = await Promise.all([
    getBackups({ from: shiftDay(today, -HISTORY_DAYS) }),
    getEmployeeSettings(),
    getBranchSettings(),
  ]);
  const branchCode = new Map(branches.map((b) => [b.id, b.code]));

  return (
    <BackupManager
      ready={ready}
      today={today}
      backups={rows}
      employees={employees
        .filter((e) => e.isActive && e.branchId)
        .map((e) => ({ id: e.id, label: `${e.name} (${e.nik})`, sub: branchCode.get(e.branchId) ?? "", branchId: e.branchId }))}
      branches={branches.filter((b) => b.active).map((b) => ({ id: b.id, label: `${b.code} - ${b.name}` }))}
    />
  );
}
