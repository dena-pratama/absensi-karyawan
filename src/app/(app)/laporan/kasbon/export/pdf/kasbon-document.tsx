import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { KasbonItem } from "@/lib/data/kasbon";
import { formatRupiah } from "@/lib/format";
import { effectiveStatus, type KasbonRecap } from "@/lib/kasbon-report";
import { KASBON_STATUS_LABEL, type KasbonStatus } from "@/lib/labels";

/* Palet cetak sama dengan PDF Laporan Kehadiran: latar putih, aksen cyan gelap. */
const C = {
  ink: "#111827",
  sub: "#4b5563",
  muted: "#6b7280",
  line: "#e5e7eb",
  zebra: "#f9fafb",
  head: "#f1f5f9",
  accent: "#0891b2",
  amber: "#b45309",
  purple: "#7e22ce",
};

const STATUS_STYLE: Record<KasbonStatus, { color: string; bg: string }> = {
  diajukan: { color: "#b45309", bg: "#fffbeb" },
  disetujui: { color: "#0e7490", bg: "#ecfeff" },
  ditolak: { color: "#be123c", bg: "#fff1f2" },
  dicairkan: { color: "#7e22ce", bg: "#faf5ff" },
  lunas: { color: "#047857", bg: "#ecfdf5" },
  dibatalkan: { color: "#6b7280", bg: "#f3f4f6" },
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
  tileValue: { fontSize: 13, fontFamily: "Helvetica-Bold", marginTop: 3 },
  tileSub: { fontSize: 7.5, color: C.sub, marginTop: 1 },
  sectionTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 6, marginTop: 4 },
  table: { borderWidth: 1, borderColor: C.line, borderRadius: 4, marginBottom: 14 },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.line, minHeight: 18, alignItems: "center" },
  th: { backgroundColor: C.head, fontFamily: "Helvetica-Bold", fontSize: 7.5, color: C.sub, textTransform: "uppercase" },
  total: { backgroundColor: C.head },
  td: { paddingVertical: 4, paddingHorizontal: 5 },
  badge: { paddingVertical: 1.5, paddingHorizontal: 5, borderRadius: 3, fontFamily: "Helvetica-Bold", fontSize: 7.5, alignSelf: "flex-start" },
  footer: { position: "absolute", bottom: 18, left: 30, right: 30, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: C.muted, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 5 },
  note: { fontSize: 7.5, color: C.muted, marginTop: 2 },
});

function Cell({ w, children, align = "left", bold = false, color }: { w: number | string; children: React.ReactNode; align?: "left" | "center" | "right"; bold?: boolean; color?: string }) {
  return (
    <View style={[s.td, typeof w === "number" ? { width: w } : { flex: 1 }]}>
      <Text style={{ textAlign: align, fontFamily: bold ? "Helvetica-Bold" : "Helvetica", color }}>{children}</Text>
    </View>
  );
}

function StatusBadge({ status }: { status: KasbonStatus }) {
  const st = STATUS_STYLE[status];
  return <Text style={[s.badge, { color: st.color, backgroundColor: st.bg }]}>{KASBON_STATUS_LABEL[status]}</Text>;
}

const date = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", year: "numeric" }) : "-";

export type KasbonPdfData = {
  periodLabel: string;
  branchLabel: string;
  statusLabel: string;
  query: string;
  printedAt: string;
  totals: { count: number; requested: number; waiting: number; disbursed: number; open: number };
  recap: KasbonRecap[];
  items: KasbonItem[];
  branchCodeOf: (employeeId: string) => string;
};

export function KasbonDocument({ data }: { data: KasbonPdfData }) {
  const { totals, recap, items } = data;
  const sum = (k: "requested" | "disbursed" | "open") => recap.reduce((t, r) => t + r[k], 0);

  return (
    <Document title={`Laporan Kasbon ${data.periodLabel}`} author="Absensi Ekspedisi" subject="Laporan kasbon karyawan">
      <Page size="A4" orientation="landscape" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.brand}>ABSENSI EKSPEDISI</Text>
            <Text style={s.title}>Laporan Kasbon Karyawan</Text>
            <Text style={s.subtitle}>Periode gajian {data.periodLabel}</Text>
          </View>
          <View style={s.meta}>
            {[
              ["Cabang", data.branchLabel],
              ["Status", data.statusLabel],
              ...(data.query ? [["Pencarian", data.query]] : []),
              ["Dicetak", data.printedAt],
            ].map(([k, v]) => (
              <View key={k} style={s.metaRow}>
                <Text style={s.metaKey}>{k}</Text>
                <Text style={s.metaVal}>{v}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={s.rule} />

        <View style={s.tiles}>
          {[
            { label: "Total Kasbon", value: formatRupiah(totals.requested), sub: `${totals.count} pengajuan · ${recap.length} karyawan`, color: C.ink },
            { label: "Menunggu Proses", value: formatRupiah(totals.waiting), sub: "diajukan & disetujui", color: C.amber },
            { label: "Sudah Dicairkan", value: formatRupiah(totals.disbursed), sub: "dicairkan & lunas", color: C.purple },
            { label: "Belum Dipotong Gaji", value: formatRupiah(totals.open), sub: "dipotong di akhir periode", color: C.accent },
          ].map((t) => (
            <View key={t.label} style={s.tile}>
              <Text style={s.tileLabel}>{t.label}</Text>
              <Text style={[s.tileValue, { color: t.color }]}>{t.value}</Text>
              <Text style={s.tileSub}>{t.sub}</Text>
            </View>
          ))}
        </View>

        <Text style={s.sectionTitle}>Rekap per Karyawan</Text>
        <View style={s.table}>
          <View style={[s.tr, s.th]} wrap={false}>
            <Cell w={22} align="center">No</Cell>
            <Cell w={80}>NIK</Cell>
            <Cell w="flex">Nama</Cell>
            <Cell w={80}>Cabang</Cell>
            <Cell w={50} align="center">Jumlah</Cell>
            <Cell w={100} align="right">Total Diajukan</Cell>
            <Cell w={100} align="right">Dicairkan</Cell>
            <Cell w={110} align="right">Belum Dipotong</Cell>
          </View>
          {recap.map((r, i) => (
            <View key={r.employeeId} style={[s.tr, i % 2 ? { backgroundColor: C.zebra } : {}]} wrap={false}>
              <Cell w={22} align="center" color={C.muted}>{i + 1}</Cell>
              <Cell w={80}>{r.nik}</Cell>
              <Cell w="flex" bold>{r.name}</Cell>
              <Cell w={80}>{r.branch}</Cell>
              <Cell w={50} align="center">{r.count}</Cell>
              <Cell w={100} align="right" bold>{formatRupiah(r.requested)}</Cell>
              <Cell w={100} align="right" color={C.purple}>{formatRupiah(r.disbursed)}</Cell>
              <Cell w={110} align="right" color={r.open ? C.accent : C.muted}>{r.open ? formatRupiah(r.open) : "-"}</Cell>
            </View>
          ))}
          {recap.length > 0 ? (
            <View style={[s.tr, s.total]} wrap={false}>
              <Cell w="flex" bold>Total</Cell>
              <Cell w={50} align="center" bold>{totals.count}</Cell>
              <Cell w={100} align="right" bold>{formatRupiah(sum("requested"))}</Cell>
              <Cell w={100} align="right" bold>{formatRupiah(sum("disbursed"))}</Cell>
              <Cell w={110} align="right" bold>{formatRupiah(sum("open"))}</Cell>
            </View>
          ) : (
            <View style={s.tr}>
              <Cell w="flex" align="center" color={C.muted}>Tidak ada kasbon untuk filter ini.</Cell>
            </View>
          )}
        </View>

        {items.length > 0 && (
          <View break>
            <Text style={s.sectionTitle}>Detail Kasbon</Text>
            <View style={s.table}>
              <View style={[s.tr, s.th]} wrap={false}>
                <Cell w={62}>Diajukan</Cell>
                <Cell w={70}>NIK</Cell>
                <Cell w="flex">Nama</Cell>
                <Cell w={60}>Cabang</Cell>
                <Cell w={80} align="right">Nominal</Cell>
                <Cell w={100} align="right">Plafon · HK</Cell>
                <Cell w={70}>Status</Cell>
                <Cell w={62}>Dicairkan</Cell>
                <Cell w={150}>Keperluan</Cell>
              </View>
              {items.map((k, i) => (
                <View key={k.id} style={[s.tr, i % 2 ? { backgroundColor: C.zebra } : {}]} wrap={false}>
                  <Cell w={62}>{date(k.requestedAt)}</Cell>
                  <Cell w={70}>{k.nik}</Cell>
                  <Cell w="flex" bold>{k.name}</Cell>
                  <Cell w={60}>{data.branchCodeOf(k.employeeId)}</Cell>
                  <Cell w={80} align="right" bold>{formatRupiah(k.amount)}</Cell>
                  <Cell w={100} align="right" color={C.sub}>{`${formatRupiah(k.plafon)} · ${k.hk}`}</Cell>
                  <View style={[s.td, { width: 70 }]}>
                    <StatusBadge status={effectiveStatus(k)} />
                  </View>
                  <Cell w={62} color={C.sub}>{date(k.disbursedAt)}</Cell>
                  <Cell w={150} color={C.sub}>{k.note || "-"}</Cell>
                </View>
              ))}
            </View>
          </View>
        )}

        <Text style={s.note}>
          Kasbon ditolak / dibatalkan tidak dihitung di total. Kasbon yang sudah dicairkan dilunasi lewat potong gaji di akhir periode gajian.
          Cabang = penempatan karyawan saat ini.
        </Text>

        <View style={s.footer} fixed>
          <Text>Absensi Ekspedisi  |  Laporan Kasbon Karyawan  |  {data.periodLabel}</Text>
          <Text render={({ pageNumber, totalPages }) => `Halaman ${pageNumber} dari ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
