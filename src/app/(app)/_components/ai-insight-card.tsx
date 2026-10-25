"use client";

import { useEffect, useState, useTransition } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { getBranchInsight, type InsightResult } from "@/lib/actions/ai-insight";

const stamp = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });

/**
 * Kartu AI Insight cabang aktif. Dimuat setelah halaman tampil (tidak menahan dashboard):
 * pakai cache hari ini, atau dibuat otomatis sekali per hari per cabang. Tombol Perbarui = buat ulang.
 */
export function AiInsightCard({ branchCode }: { branchCode: string }) {
  const [result, setResult] = useState<InsightResult | null>(null);
  const [busy, start] = useTransition();

  useEffect(() => {
    let alive = true;
    getBranchInsight(false).then((r) => {
      if (alive) setResult(r);
    });
    return () => {
      alive = false;
    };
  }, []);

  const refresh = () =>
    start(async () => {
      setResult(await getBranchInsight(true));
    });

  const loading = busy || result === null;

  return (
    <section aria-labelledby="ai-insight-title" className="relative overflow-hidden bg-panel border border-line rounded-2xl p-5 flex flex-col gap-3 h-full">
      <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-transparent to-cyan-500/10 pointer-events-none" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="ai-insight-title" className="text-sm font-bold text-ink flex items-center gap-2">
            <Icon name="auto_awesome" className="text-[18px] text-purple-300" />
            AI Insight · {branchCode}
          </h2>
          <p className="text-[11px] text-gray-400 mt-0.5 truncate">
            {!loading && result.ok ? `${result.model} · dibuat ${stamp(result.createdAt)}` : "Ringkasan otomatis sekali sehari per cabang"}
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line-strong text-xs text-gray-300 hover:text-brand-ink hover:border-cyan-500/50 transition disabled:opacity-50 flex-shrink-0"
        >
          <Icon name="refresh" className={`text-[15px] ${loading ? "animate-spin" : ""}`} />
          Perbarui
        </button>
      </div>
      <div className="relative text-xs text-gray-200 leading-relaxed">
        {loading ? (
          <div className="space-y-2" aria-label="Membuat insight">
            {[90, 75, 82, 60].map((w) => (
              <div key={w} className="h-3 rounded bg-panel-raised animate-pulse" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : result.ok ? (
          <div className="[&_ul]:list-disc [&_ul]:pl-4 [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:pl-4 [&_p]:my-1 [&_strong]:text-ink [&_table]:w-full">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.content}</ReactMarkdown>
          </div>
        ) : result.limit ? (
          <div role="alert" className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-3 flex gap-2.5 text-amber-100">
            <Icon name="speed" className="text-[18px] text-amber-400 flex-shrink-0" />
            <div className="space-y-1.5">
              <p className="font-semibold">Model AI kena limit</p>
              <p>{result.error}</p>
              {result.canManage ? (
                <Link href="/pengaturan/ai" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-400 text-black font-semibold">
                  <Icon name="swap_horiz" className="text-[14px]" />
                  Ganti model / platform
                </Link>
              ) : (
                <p className="text-amber-300">Minta admin mengganti model di Pengaturan &gt; Konektor AI.</p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-amber-300 flex items-center gap-2">
            <Icon name="info" className="text-[16px] flex-shrink-0" />
            {result.error}
          </p>
        )}
      </div>
    </section>
  );
}
