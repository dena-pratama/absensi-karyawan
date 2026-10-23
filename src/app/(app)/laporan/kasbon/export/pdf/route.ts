import { renderToBuffer } from "@react-pdf/renderer";
import type { NextRequest } from "next/server";
import { isAdmin } from "@/lib/data/access";
import { getKasbonReport } from "@/lib/data/kasbon";
import { getReportOptions } from "@/lib/data/report";
import { formatDateLong, formatDateShort, formatTimeWIB, todayWIB } from "@/lib/format";
import { buildKasbonReport, parseKasbonFilters } from "@/lib/kasbon-report";
import { KASBON_STATUS_LABEL } from "@/lib/labels";
import { downloadHeaders } from "../../../export/load";
import { KasbonDocument } from "./kasbon-document";

/** GET /laporan/kasbon/export/pdf?period=&branch=&status=&q= → PDF A4 landscape (ringkasan, rekap per karyawan, detail). */
export async function GET(request: NextRequest) {
  if (!(await isAdmin())) return new Response("Hanya admin yang bisa mengunduh laporan kasbon.", { status: 403 });

  const filters = parseKasbonFilters(request.nextUrl.searchParams);
  const [report, options] = await Promise.all([getKasbonReport(), getReportOptions()]);
  if (!report.ready) return new Response("Fitur kasbon belum aktif. Jalankan migrasi kasbon di Supabase.", { status: 409 });

  const branchOf = new Map(options.employees.map((e) => [e.id, e.branchId]));
  const branchCode = new Map(options.branches.map((b) => [b.id, b.label.split(" - ")[0]]));
  const { filtered, totals, recap } = buildKasbonReport(report.items, filters, branchOf, branchCode);

  const period = filters.period ? report.items.find((k) => k.periodStart === filters.period) : null;
  const periodEnd = period?.periodEnd ?? (report.currentPeriod?.start === filters.period ? report.currentPeriod.end : null);
  const periodLabel = filters.period ? `${formatDateShort(filters.period)} s/d ${periodEnd ? formatDateShort(periodEnd) : "-"}` : "Semua periode";
  // Kode cabang bebas format → amankan untuk nama file
  const code = (filters.branch ? (branchCode.get(filters.branch) ?? "cabang") : "semua-cabang").replace(/[^\w.-]+/g, "-");

  const pdf = await renderToBuffer(
    KasbonDocument({
      data: {
        periodLabel,
        branchLabel: options.branches.find((b) => b.id === filters.branch)?.label ?? "Semua Cabang",
        statusLabel: filters.status ? KASBON_STATUS_LABEL[filters.status] : "Semua Status",
        query: filters.q.trim(),
        printedAt: `${formatDateLong(todayWIB())}, ${formatTimeWIB(new Date().toISOString())}`,
        totals,
        recap,
        items: filtered,
        branchCodeOf: (id) => branchCode.get(branchOf.get(id) ?? "") ?? "-",
      },
    }),
  );
  const name = `laporan-kasbon_${code}_${filters.period && periodEnd ? `${filters.period}_${periodEnd}` : "semua-periode"}.pdf`;
  return new Response(new Uint8Array(pdf), { headers: downloadHeaders(name, "application/pdf") });
}
