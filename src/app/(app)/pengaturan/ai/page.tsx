import type { Metadata } from "next";
import { Suspense } from "react";
import { PageBody } from "@/components/shell/page-layout";
import { getConnectors } from "@/lib/ai/connector";
import { isAiKeyConfigured } from "@/lib/ai/crypto";
import { SettingsHeader } from "../_components/settings-header";
import { SettingsSkeleton } from "../_components/settings-skeleton";
import { ConnectorManager } from "./connector-manager";

export const metadata: Metadata = { title: "Konektor AI — Absensi Ekspedisi" };

export default function KonektorAiPage() {
  return (
    <>
      <SettingsHeader tab="ai" />
      <PageBody>
        <Suspense fallback={<SettingsSkeleton />}>
          <Content />
        </Suspense>
      </PageBody>
    </>
  );
}

async function Content() {
  const { connectors, tableMissing } = await getConnectors();
  return <ConnectorManager connectors={connectors} tableMissing={tableMissing} keyConfigured={isAiKeyConfigured()} />;
}
