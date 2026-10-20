import type { Metadata } from "next";
import { Suspense } from "react";
import { PageBody } from "@/components/shell/page-layout";
import { getUserAccessList } from "@/lib/data/access";
import { getReportOptions } from "@/lib/data/report";
import { isAdminApiConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { SettingsHeader } from "../_components/settings-header";
import { SettingsSkeleton } from "../_components/settings-skeleton";
import { AccessManager } from "./access-manager";

export const metadata: Metadata = { title: "Pengguna & Akses" };

export default function PenggunaAksesPage() {
  return (
    <>
      <SettingsHeader tab="akses" />
      <PageBody>
        <Suspense fallback={<SettingsSkeleton />}>
          <Content />
        </Suspense>
      </PageBody>
    </>
  );
}

/** "20 Okt 2026, 14.05" (WIB) — diformat di server supaya tidak beda dengan browser. */
function formatStamp(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" });
}

async function Content() {
  const supabase = await createClient();
  const [{ users, rlsReady }, options, { data: auth }] = await Promise.all([
    getUserAccessList(),
    getReportOptions(),
    supabase.auth.getClaims(),
  ]);

  return (
    <AccessManager
      rlsReady={rlsReady}
      adminApiReady={isAdminApiConfigured}
      myUserId={auth?.claims?.sub ?? ""}
      users={users.map((u) => ({ ...u, createdLabel: formatStamp(u.createdAt), lastSignInLabel: formatStamp(u.lastSignInAt) }))}
      branches={options.branches}
      employees={options.employees}
    />
  );
}
