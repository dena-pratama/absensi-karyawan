import "server-only";
import type { NextRequest } from "next/server";
import { getReportData, getReportOptions } from "@/lib/data/report";
import { parseReportFilters } from "@/lib/report-filters";

/** Data laporan untuk route export (filter dari query string yang sama dengan halaman). */
export async function loadReport(request: NextRequest) {
  // Pesan koreksi filter (error) hanya untuk tampilan halaman; export memakai filter yang sudah dikoreksi.
  const { branchId, employeeId, from, to, status } = parseReportFilters(request.nextUrl.searchParams);
  const filters = { branchId, employeeId, from, to, status };
  const options = await getReportOptions();
  const data = await getReportData(filters, options);
  const code = options.branches.find((b) => b.id === filters.branchId)?.label.split(" - ")[0] ?? "semua-cabang";
  return { data, baseName: `laporan-absensi_${code}_${filters.from}_${filters.to}` };
}

export function downloadHeaders(filename: string, contentType: string) {
  return {
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
  };
}
