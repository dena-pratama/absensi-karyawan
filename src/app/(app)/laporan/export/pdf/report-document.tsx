import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReportData, ReportRow } from "@/lib/data/report";
import { formatDateLong, formatDateSlash } from "@/lib/format";
import { ATTENDANCE_LABEL, type AttendanceStatus } from "@/lib/labels";

/* Palet cetak: latar putih, aksen cyan gelap supaya tetap terbaca saat dicetak hitam-putih. */
const C = {
  ink: "#111827",
  sub: "#4b5563",
  muted: "#6b7280",
  line: "#e5e7eb",
  zebra: "#f9fafb",
  head: "#f1f5f9",
  accent: "#0891b2",
  hadir: "#047857",
  sakit: "#b45309",
  tidak_hadir: "#be123c",
};

const STATUS_BG: Record<AttendanceStatus, string> = {
  hadir: "#ecfdf5",
  sakit: "#fffbeb",
  tidak_hadir: "#fff1f2",
};

const s = StyleSheet.create({
  page: { paddingTop: 28, paddingBottom: 40, paddingHorizontal: 30, fontFamily: "Helvetica", fontSize: 8.5, color: C.ink },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
  brand: { fontSize: 8, color: C.accent, fontFamily: "Helvetica-Bold", letterSpacing: 1, marginBottom: 3 },
  title: { fontSize: 17, fontFamily: "Helvetica-Bold" },
  subtitle: { fontSize: 9, color: C.sub, marginTop: 2 },
  meta: { width: 250, borderWidth: 1, borderColor: C.line, borderRadius: 4, padding: 8 },
  metaRow: { flexDirection: "row", marginBottom: 2.5 },
  metaKey: { width: 62, color: C.muted },
  metaVal: { flex: 1, fontFamily: "Helvetica-Bold" },
  rule: { height: 2, backgroundColor: C.accent, marginBottom: 12 },
  tiles: { flexDirection: "row", gap: 8, marginBottom: 14 },
  tile: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 4, padding: 8 },
  tileLabel: { fontSize: 7.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  tileValue: { fontSize: 15, fontFamily: "Helvetica-Bold", marginTop: 3 },
  tileSub: { fontSize: 7.5, color: C.sub, marginTop: 1 },
  sectionTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 6, marginTop: 4 },
  table: { borderWidth: 1, borderColor: C.line, borderRadius: 4, marginBottom: 14 },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.line, minHeight: 18, alignItems: "center" },
  th: { backgroundColor: C.head, fontFamily: "Helvetica-Bold", fontSize: 7.5, color: C.sub, textTransform: "uppercase" },
  td: { paddingVertical: 4, paddingHorizontal: 5 },
  dateRow: { flexDirection: "row", justifyContent: "space-between", backgroundColor: "#ecfeff", paddingVertical: 4, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: C.line },
  dateText: { fontFamily: "Helvetica-Bold", color: C.accent, fontSize: 8.5 },
  badge: { paddingVertical: 1.5, paddingHorizontal: 5, borderRadius: 3, fontFamily: "Helvetica-Bold", fontSize: 7.5, alignSelf: "flex-start" },
  footer: { position: "absolute", bottom: 18, left: 30, right: 30, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: C.muted, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 5 },
  note: { fontSize: 7.5, color: C.muted, marginTop: 2 },
});

const pct = (n: number, total: number) => (total ? `${Math.round((n / total) * 1000) / 10}%` : "-");

function Cell({ w, children, align = "left", bold = false, color }: { w: number | string; children: React.ReactNode; align?: "left" | "center" | "right"; bold?: boolean; color?: string }) {
  return (
    <View style={[s.td, typeof w === "number" ? { width: w } : { flex: 1 }]}>
      <Text style={{ textAlign: align, fontFamily: bold ? "Helvetica-Bold" : "Helvetica", color }}>{children}</Text>
    </View>
  );
}

function StatusBadge({ status }: { status: AttendanceStatus }) {
  return <Text style={[s.badge, { color: C[status], backgroundColor: STATUS_BG[status] }]}>{ATTENDANCE_LABEL[status]}</Text>;
}

function groupByDate(rows: ReportRow[]) {
  const map = new Map<string, ReportRow[]>();
  for (const r of rows) map.set(r.date, [...(map.get(r.date) ?? []), r]);
  return [...map.entries()];
}

export function ReportDocument({ data, printedAt }: { data: ReportData; printedAt: string }) {
  const { totals, filters } = data;
  const period = `${formatDateSlash(filters.from)} s/d ${formatDateSlash(filters.to)}`;

  return (
    <Document title={`Laporan Absensi ${period}`} author="Absensi Ekspedisi" subject="Laporan absensi karyawan">
      <Page size="A4" orientation="landscape" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.brand}>ABSENSI EKSPEDISI</Text>
            <Text style={s.title}>Laporan Absensi Karyawan</Text>
            <Text style={s.subtitle}>Periode {formatDateLong(filters.from)} - {formatDateLong(filters.to)}</Text>
          </View>
          <View style={s.meta}>
            {[
              ["Cabang", data.branchLabel],
              ["Karyawan", data.employeeLabel],
              ["Status", filters.status ? ATTENDANCE_LABEL[filters.status] : "Semua Status"],
              ["Dicetak", printedAt],
            ].map(([k, v]) => (
              <View key={k} style={s.metaRow}>
                <Text style={s.metaKey}>{k}</Text>
                <Text style={s.metaVal}>{v}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={s.rule} />

        {/* Ringkasan */}
        <View style={s.tiles}>
          {[
            { label: "Karyawan", value: totals.employees, sub: `${totals.days} hari tercatat`, color: C.ink },
            { label: "Total Data", value: totals.total, sub: "baris absensi", color: C.ink },
            { label: "Hadir", value: totals.hadir, sub: pct(totals.hadir, totals.total), color: C.hadir },
            { label: "Sakit", value: totals.sakit, sub: pct(totals.sakit, totals.total), color: C.sakit },
            { label: "Tidak Hadir", value: totals.tidakHadir, sub: pct(totals.tidakHadir, totals.total), color: C.tidak_hadir },
          ].map((t) => (
            <View key={t.label} style={s.tile}>
              <Text style={s.tileLabel}>{t.label}</Text>
              <Text style={[s.tileValue, { color: t.color }]}>{t.value}</Text>
              <Text style={s.tileSub}>{t.sub}</Text>
            </View>
          ))}
        </View>

        {/* Rekap per karyawan */}
        <Text style={s.sectionTitle}>Rekap per Karyawan</Text>
        <View style={s.table}>
          <View style={[s.tr, s.th]} wrap={false}>
            <Cell w={22} align="center">No</Cell>
            <Cell w={70}>NIK</Cell>
            <Cell w="flex">Nama</Cell>
            <Cell w={150}>Jabatan</Cell>
            <Cell w={95}>Cabang</Cell>
            <Cell w={38} align="center">H</Cell>
            <Cell w={38} align="center">S</Cell>
            <Cell w={38} align="center">TH</Cell>
            <Cell w={42} align="center">Total</Cell>
            <Cell w={52} align="right">% Hadir</Cell>
          </View>
          {data.employees.map((e, i) => (
            <View key={e.employeeId} style={[s.tr, i % 2 ? { backgroundColor: C.zebra } : {}]} wrap={false}>
              <Cell w={22} align="center" color={C.muted}>{i + 1}</Cell>
              <Cell w={70}>{e.nik}</Cell>
              <Cell w="flex" bold>{e.name}</Cell>
              <Cell w={150} color={C.sub}>{e.role}</Cell>
              <Cell w={95}>{e.branches}</Cell>
              <Cell w={38} align="center" bold color={C.hadir}>{e.hadir}</Cell>
              <Cell w={38} align="center" color={C.sakit}>{e.sakit}</Cell>
              <Cell w={38} align="center" color={C.tidak_hadir}>{e.tidakHadir}</Cell>
              <Cell w={42} align="center">{e.total}</Cell>
              <Cell w={52} align="right" bold>{e.percent === null ? "-" : `${e.percent}%`}</Cell>
            </View>
          ))}
          {data.employees.length === 0 && (
            <View style={s.tr}>
              <Cell w="flex" align="center" color={C.muted}>Tidak ada data absensi untuk filter ini.</Cell>
            </View>
          )}
        </View>

        {/* Detail harian, dikelompokkan per tanggal */}
        {data.rows.length > 0 && (
          <View break>
            <Text style={s.sectionTitle}>Detail Absensi Harian</Text>
            <View style={s.table}>
              <View style={[s.tr, s.th]} wrap={false}>
                <Cell w={80}>Cabang</Cell>
                <Cell w={70}>NIK</Cell>
                <Cell w="flex">Nama</Cell>
                <Cell w={150}>Jabatan</Cell>
                <Cell w={70}>Status</Cell>
                <Cell w={190}>Keterangan</Cell>
              </View>
              {groupByDate(data.rows).map(([date, list]) => {
                const h = list.filter((r) => r.status === "hadir").length;
                const sk = list.filter((r) => r.status === "sakit").length;
                const th = list.length - h - sk;
                return (
                  <View key={date}>
                    <View style={s.dateRow} wrap={false} minPresenceAhead={36}>
                      <Text style={s.dateText}>{formatDateLong(date)}</Text>
                      <Text style={{ color: C.sub, fontSize: 7.5 }}>
                        {list.length} data  |  Hadir {h}  |  Sakit {sk}  |  Tidak Hadir {th}
                      </Text>
                    </View>
                    {list.map((r, i) => (
                      <View key={`${r.employeeId}-${r.date}`} style={[s.tr, i % 2 ? { backgroundColor: C.zebra } : {}]} wrap={false}>
                        <Cell w={80}>{r.branchCode}</Cell>
                        <Cell w={70}>{r.nik}</Cell>
                        <Cell w="flex" bold>{r.name}</Cell>
                        <Cell w={150} color={C.sub}>{r.role}</Cell>
                        <View style={[s.td, { width: 70 }]}>
                          <StatusBadge status={r.status} />
                        </View>
                        <Cell w={190} color={C.sub}>{r.note || "-"}</Cell>
                      </View>
                    ))}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        <Text style={s.note}>
          % Hadir = jumlah hari Hadir dibagi jumlah hari yang sudah diisi pada periode ini. Cabang = tempat absensi dicatat.
        </Text>

        {/* Footer di setiap halaman */}
        <View style={s.footer} fixed>
          <Text>Absensi Ekspedisi  |  Laporan Absensi Karyawan  |  {period}</Text>
          <Text render={({ pageNumber, totalPages }) => `Halaman ${pageNumber} dari ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
