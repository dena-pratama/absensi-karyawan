import type { Metadata } from "next";
import { Suspense } from "react";
import { PageBody } from "@/components/shell/page-layout";
import {
  getBranchSettings,
  getClusterOptions,
  getEmployeeSettings,
  getRecentAudit,
  getRoleSettings,
} from "@/lib/data/settings";
import { formatTimeWIB, todayWIB } from "@/lib/format";
import { SettingsHeader } from "../_components/settings-header";
import { SettingsSkeleton } from "../_components/settings-skeleton";
import { BranchManager, type AuditView } from "./branch-manager";

export const metadata: Metadata = { title: "Manajemen Cabang" };

export default function PengaturanCabangPage() {
  return (
    <>
      <SettingsHeader tab="cabang" />
      <PageBody>
        <Suspense fallback={<SettingsSkeleton />}>
          <Content />
        </Suspense>
      </PageBody>
    </>
  );
}

const TABLE_LABEL: Record<string, string> = { branch: "cabang", employee: "karyawan", job_role: "jabatan" };
const ACTION_LABEL = { insert: "menambahkan", update: "memperbarui", delete: "menghapus" } as const;

async function Content() {
  const [{ branches, geoReady }, clusters, employees, roles, audit] = await Promise.all([
    getBranchSettings(),
    getClusterOptions(),
    getEmployeeSettings(),
    getRoleSettings(),
    getRecentAudit(8),
  ]);
  const roleName = new Map(roles.map((r) => [r.id, r.name]));
  const today = todayWIB();

  const auditView: AuditView[] = audit.map((a) => {
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date(a.changedAt));
    const dateLabel =
      day === today
        ? "Hari ini"
        : new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short" }).format(new Date(a.changedAt));
    return {
      id: a.id,
      text: `Admin ${ACTION_LABEL[a.action]} ${TABLE_LABEL[a.table] ?? a.table}`,
      subject: a.label,
      when: `${dateLabel}, ${formatTimeWIB(a.changedAt)}`,
    };
  });

  return (
    <BranchManager
      branches={branches}
      geoReady={geoReady}
      clusters={clusters}
      employees={employees
        .filter((e) => e.isActive)
        .map((e) => ({ id: e.id, label: `${e.name} (${e.nik})`, sub: roleName.get(e.roleId) ?? "" }))}
      audit={auditView}
    />
  );
}
