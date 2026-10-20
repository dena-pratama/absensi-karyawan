import { renderToBuffer } from "@react-pdf/renderer";
import type { NextRequest } from "next/server";
import { formatDateLong, formatTimeWIB, todayWIB } from "@/lib/format";
import { downloadHeaders, loadReport } from "../load";
import { ReportDocument } from "./report-document";

/** GET /laporan/export/pdf?… → PDF A4 landscape (ringkasan, rekap per karyawan, detail harian). */
export async function GET(request: NextRequest) {
  const { data, baseName } = await loadReport(request);
  const printedAt = `${formatDateLong(todayWIB())}, ${formatTimeWIB(new Date().toISOString())}`;
  const pdf = await renderToBuffer(ReportDocument({ data, printedAt }));
  return new Response(new Uint8Array(pdf), { headers: downloadHeaders(`${baseName}.pdf`, "application/pdf") });
}
