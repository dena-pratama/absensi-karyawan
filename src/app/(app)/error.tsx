"use client";

import { PageBody } from "@/components/shell/page-layout";

export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <PageBody>
      <div className="rounded-2xl border border-rose-500/30 bg-rose-950/20 p-8 text-center flex flex-col items-center gap-3">
        <p className="text-sm text-rose-200">Terjadi kesalahan saat memuat data.</p>
        <p className="text-xs text-gray-400">{error instanceof Error ? error.message : "Silakan coba lagi."}</p>
        <button
          type="button"
          onClick={() => retry()}
          className="px-3 py-1.5 rounded-lg bg-panel-raised border border-line-strong text-xs text-gray-200 hover:border-cyan-400 transition"
        >
          Coba lagi
        </button>
      </div>
    </PageBody>
  );
}
