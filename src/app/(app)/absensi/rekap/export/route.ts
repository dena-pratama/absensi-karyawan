import type { NextRequest } from "next/server";
import { getMonthlyRekap } from "@/lib/data/rekap";
import { getShellData } from "@/lib/data/shell";
import { monthOf, parseMonthParam, todayWIB } from "@/lib/format";

const CODE = { hadir: "H", sakit: "S", tidak_hadir: "TH" } as const;

function csvCell(value: string | number) {
  const s = String(value);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** GET /absensi/rekap/export?bulan=YYYY-MM&role=<id> → CSV rekap bulanan cabang aktif. */
export async function GET(request: NextRequest) {
  const { activeBranch } = await getShellData();
  if (!activeBranch) return new Response("Belum ada cabang.", { status: 404 });

  const params = request.nextUrl.searchParams;
  const month = parseMonthParam(params.get("bulan") ?? undefined, monthOf(todayWIB()));
  const roleId = params.get("role") || undefined;
  const { days, rows } = await getMonthlyRekap(activeBranch.id, month, roleId);

  const header = ["No", "NIK", "Nama", "Jabatan", ...days.map((d) => String(d.day)), "H", "S", "TH", "% Hadir"];
  const lines = rows.map((r, i) => [
    i + 1,
    r.nik,
    r.name,
    r.roleName,
    ...days.map((d) => (r.cells[d.date] ? CODE[r.cells[d.date]] : "")),
    r.summary.hadir,
    r.summary.sakit,
    r.summary.tidakHadir,
    r.summary.percent ?? "",
  ]);

  // BOM supaya Excel membaca UTF-8 dengan benar.
  const csv = "﻿" + [header, ...lines].map((l) => l.map(csvCell).join(",")).join("\r\n");
  const filename = `rekap-${activeBranch.code}-${month}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
