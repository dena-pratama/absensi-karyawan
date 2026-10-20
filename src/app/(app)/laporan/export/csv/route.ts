import type { NextRequest } from "next/server";
import { ATTENDANCE_LABEL } from "@/lib/labels";
import { downloadHeaders, loadReport } from "../load";

function cell(v: string | number | null) {
  const s = v === null ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const toCsv = (rows: (string | number | null)[][]) => "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");

/** GET /laporan/export/csv?…&jenis=detail|rekap */
export async function GET(request: NextRequest) {
  const { data, baseName } = await loadReport(request);
  const jenis = request.nextUrl.searchParams.get("jenis") === "rekap" ? "rekap" : "detail";

  const csv =
    jenis === "rekap"
      ? toCsv([
          ["NIK", "Nama", "Jabatan", "Cabang", "Hadir", "Sakit", "Tidak Hadir", "Total Hari", "% Hadir"],
          ...data.employees.map((e) => [e.nik, e.name, e.role, e.branches, e.hadir, e.sakit, e.tidakHadir, e.total, e.percent]),
        ])
      : toCsv([
          ["Tanggal", "Kode Cabang", "Nama Cabang", "NIK", "Nama", "Jabatan", "Status", "Keterangan"],
          ...data.rows.map((r) => [r.date, r.branchCode, r.branchName, r.nik, r.name, r.role, ATTENDANCE_LABEL[r.status], r.note]),
        ]);

  return new Response(csv, { headers: downloadHeaders(`${baseName}_${jenis}.csv`, "text/csv; charset=utf-8") });
}
