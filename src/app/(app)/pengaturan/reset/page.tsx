import type { Metadata } from "next";
import { PageBody } from "@/components/shell/page-layout";
import { isAdminApiConfigured } from "@/lib/supabase/admin";
import { SettingsHeader } from "../_components/settings-header";
import { ResetManager } from "./reset-manager";

export const metadata: Metadata = { title: "Reset Data" };

export default function ResetDataPage() {
  return (
    <>
      <SettingsHeader tab="reset" />
      <PageBody>
        <ResetManager adminApiReady={isAdminApiConfigured} />
      </PageBody>
    </>
  );
}
