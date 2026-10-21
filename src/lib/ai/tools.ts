import "server-only";
import { randomUUID } from "node:crypto";
import { getAttendance, getRoster } from "@/lib/data/attendance";
import { getDashboardStats } from "@/lib/data/dashboard";
import { getReportData, getReportOptions } from "@/lib/data/report";
import { getBranchSettings, getEmployeeSettings, getRoleSettings } from "@/lib/data/settings";
import type { BranchSummary } from "@/lib/data/shell";
import { parseDateParam } from "@/lib/format";
import { ATTENDANCE_LABEL, BRANCH_TYPE_LABEL, type AttendanceStatus } from "@/lib/labels";
import { parseReportFilters } from "@/lib/report-filters";
import { signPayload } from "./crypto";
import type { ToolDef, ToolExecutor } from "./engine";
import { PROPOSAL_TTL_MS, type AttendanceProposal, type SignedProposal } from "./proposal";

const STATUS_ENUM = ["hadir", "sakit", "tidak_hadir"];
const ROW_LIMIT = 150;

const obj = (properties: Record<string, unknown>, required: string[] = []): ToolDef["parameters"] => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

export const AI_TOOLS: ToolDef[] = [
  {
    name: "daftar_cabang",
    description: "Daftar semua cabang/hub: kode, nama, tipe, status aktif, jumlah staf aktif.",
    parameters: obj({}),
  },
  {
    name: "ringkasan_kehadiran_harian",
    description:
      "Rekap kehadiran per cabang pada satu tanggal (default hari ini): total staf, hadir, sakit, tidak hadir, belum diabsen, persentase hadir.",
    parameters: obj({ tanggal: { type: "string", description: "YYYY-MM-DD. Kosongkan untuk hari ini." } }),
  },
  {
    name: "cari_absensi",
    description:
      "Tarik data absensi pada rentang tanggal, bisa difilter cabang, karyawan (NIK), atau status. Mengembalikan total, rekap per karyawan, dan baris detail (maks 150 baris).",
    parameters: obj(
      {
        dari: { type: "string", description: "Tanggal awal YYYY-MM-DD" },
        sampai: { type: "string", description: "Tanggal akhir YYYY-MM-DD" },
        kode_cabang: { type: "string", description: "Kode cabang, mis. JKT109A. Kosongkan untuk semua cabang." },
        nik: { type: "string", description: "NIK karyawan, mis. EXP-0101. Kosongkan untuk semua." },
        status: { type: "string", enum: STATUS_ENUM, description: "Filter status (opsional)." },
      },
      ["dari", "sampai"],
    ),
  },
  {
    name: "daftar_karyawan",
    description: "Daftar karyawan: NIK, nama, jabatan, cabang penempatan, status kontrak, aktif/nonaktif.",
    parameters: obj({
      kode_cabang: { type: "string", description: "Filter kode cabang (opsional)." },
      cari: { type: "string", description: "Cari nama/NIK (opsional)." },
    }),
  },
  {
    name: "usulkan_perubahan_absensi",
    description:
      "Buat USULAN pengisian/perubahan ceklis absensi untuk satu cabang dan satu tanggal. Tidak langsung menyimpan: admin harus menyetujui usulan di layar. Pakai hanya jika admin meminta mengubah/mengisi absensi.",
    parameters: obj(
      {
        tanggal: { type: "string", description: "YYYY-MM-DD, tidak boleh lewat hari ini." },
        kode_cabang: { type: "string", description: "Kode cabang tempat absensi dicatat." },
        perubahan: {
          type: "array",
          minItems: 1,
          items: obj(
            {
              nik: { type: "string" },
              status: { type: "string", enum: STATUS_ENUM },
              keterangan: { type: "string", description: "Keterangan singkat (opsional, maks 200 karakter)." },
            },
            ["nik", "status"],
          ),
        },
      },
      ["tanggal", "kode_cabang", "perubahan"],
    ),
  },
];

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const json = (v: unknown) => JSON.stringify(v);

/**
 * Executor tool untuk satu pertanyaan. Usulan perubahan dikumpulkan di `proposals`
 * dan dikembalikan ke client untuk disetujui / ditolak admin.
 */
export function createToolExecutor(today: string) {
  const proposals: SignedProposal[] = [];

  const branchByCode = async () => {
    const { branches } = await getBranchSettings();
    return { branches, byCode: new Map(branches.map((b) => [b.code.toUpperCase(), b])) };
  };

  const execute: ToolExecutor = async (name, args) => {
    try {
      switch (name) {
        case "daftar_cabang": {
          const { branches } = await branchByCode();
          return json(
            branches.map((b) => ({
              kode: b.code,
              nama: b.name,
              tipe: BRANCH_TYPE_LABEL[b.type],
              status: b.active ? "aktif" : "nonaktif",
              staf_aktif: b.staffCount,
            })),
          );
        }

        case "ringkasan_kehadiran_harian": {
          const date = parseDateParam(str(args.tanggal) || undefined, today);
          const { branches } = await branchByCode();
          const summaries: BranchSummary[] = branches
            .filter((b) => b.active)
            .map((b) => ({ id: b.id, code: b.code, name: b.name, branch_type: b.type, status: b.originalStatus }));
          const stats = await getDashboardStats(summaries, date);
          return json({
            tanggal: date,
            cabang: stats.map((s) => ({
              kode: s.code,
              nama: s.name,
              total_staf: s.total,
              hadir: s.hadir,
              sakit: s.sakit,
              tidak_hadir: s.tidakHadir,
              belum_diabsen: s.belum,
              persen_hadir: s.percent,
            })),
          });
        }

        case "cari_absensi": {
          const options = await getReportOptions();
          const code = str(args.kode_cabang).toUpperCase();
          const branch = code ? options.branches.find((b) => b.label.toUpperCase().startsWith(`${code} -`)) : undefined;
          if (code && !branch) return json({ error: `Cabang ${code} tidak ditemukan.` });
          const nik = str(args.nik).toUpperCase();
          const employee = nik ? options.employees.find((e) => e.label.toUpperCase().endsWith(`(${nik})`)) : undefined;
          if (nik && !employee) return json({ error: `Karyawan dengan NIK ${nik} tidak ditemukan.` });

          const params = new URLSearchParams({ dari: str(args.dari), sampai: str(args.sampai) });
          if (branch) params.set("cabang", branch.id);
          if (employee) params.set("karyawan", employee.id);
          if (str(args.status)) params.set("status", str(args.status));
          const { error: note, ...filters } = parseReportFilters(params);
          const data = await getReportData(filters, options);
          return json({
            filter: { dari: filters.from, sampai: filters.to, cabang: data.branchLabel, karyawan: data.employeeLabel, status: filters.status || "semua", catatan: note },
            total: data.totals,
            rekap_per_karyawan: data.employees.map((e) => ({
              nik: e.nik,
              nama: e.name,
              jabatan: e.role,
              cabang: e.branches,
              hadir: e.hadir,
              sakit: e.sakit,
              tidak_hadir: e.tidakHadir,
              total_hari: e.total,
              persen_hadir: e.percent,
            })),
            detail: data.rows.slice(0, ROW_LIMIT).map((r) => ({
              tanggal: r.date,
              cabang: r.branchCode,
              nik: r.nik,
              nama: r.name,
              status: ATTENDANCE_LABEL[r.status],
              keterangan: r.note || undefined,
            })),
            detail_dipotong: data.rows.length > ROW_LIMIT ? `${data.rows.length - ROW_LIMIT} baris lain tidak ditampilkan` : undefined,
          });
        }

        case "daftar_karyawan": {
          const [employees, { branches }, roles] = await Promise.all([getEmployeeSettings(), branchByCode(), getRoleSettings()]);
          const branchCode = new Map(branches.map((b) => [b.id, b.code]));
          const roleName = new Map(roles.map((r) => [r.id, r.name]));
          const code = str(args.kode_cabang).toUpperCase();
          const q = str(args.cari).toLowerCase();
          return json(
            employees
              .filter((e) => !code || branchCode.get(e.branchId)?.toUpperCase() === code)
              .filter((e) => !q || e.name.toLowerCase().includes(q) || e.nik.toLowerCase().includes(q))
              .slice(0, 300)
              .map((e) => ({
                nik: e.nik,
                nama: e.name,
                jabatan: roleName.get(e.roleId) ?? "-",
                cabang: branchCode.get(e.branchId) ?? "-",
                kontrak: e.contract,
                aktif: e.isActive,
              })),
          );
        }

        case "usulkan_perubahan_absensi": {
          const date = parseDateParam(str(args.tanggal), "");
          if (!date) return json({ error: "Tanggal tidak valid (format YYYY-MM-DD)." });
          if (date > today) return json({ error: "Tidak bisa mengisi absensi untuk tanggal yang akan datang." });
          const { byCode } = await branchByCode();
          const branch = byCode.get(str(args.kode_cabang).toUpperCase());
          if (!branch) return json({ error: `Cabang ${str(args.kode_cabang)} tidak ditemukan.` });

          const items = Array.isArray(args.perubahan) ? (args.perubahan as Record<string, unknown>[]) : [];
          if (items.length === 0) return json({ error: "Daftar perubahan kosong." });

          const roster = await getRoster(branch.id, date);
          const byNik = new Map(roster.map((r) => [r.nik.toUpperCase(), r]));
          const current = new Map((await getAttendance(roster.map((r) => r.employeeId), date)).map((a) => [a.employeeId, a.status]));

          const unknown: string[] = [];
          const changes: AttendanceProposal["changes"] = [];
          for (const item of items) {
            const nik = str(item.nik).toUpperCase();
            const status = str(item.status) as AttendanceStatus;
            const emp = byNik.get(nik);
            if (!emp || !STATUS_ENUM.includes(status)) {
              unknown.push(nik || "(kosong)");
              continue;
            }
            changes.push({
              employeeId: emp.employeeId,
              nik: emp.nik,
              name: emp.name,
              status,
              note: str(item.keterangan).slice(0, 200),
              prevStatus: current.get(emp.employeeId) ?? null,
            });
          }
          if (changes.length === 0) {
            return json({ error: `Tidak ada perubahan valid. NIK tidak terdaftar di ${branch.code} pada ${date}: ${unknown.join(", ")}` });
          }

          const proposal: AttendanceProposal = {
            id: randomUUID().slice(0, 8),
            branchId: branch.id,
            branchCode: branch.code,
            date,
            changes,
            expiresAt: Date.now() + PROPOSAL_TTL_MS,
          };
          proposals.push({ proposal, token: signPayload(proposal) });
          return json({
            usulan_id: proposal.id,
            status: "MENUNGGU PERSETUJUAN ADMIN, belum tersimpan",
            jumlah_perubahan: changes.length,
            nik_ditolak: unknown.length ? unknown : undefined,
            instruksi: "Sampaikan ringkasan usulan ke admin dan minta admin menekan Setujui/Tolak pada kartu usulan. Jangan menyatakan data sudah tersimpan.",
          });
        }

        default:
          return json({ error: `Tool ${name} tidak dikenal.` });
      }
    } catch (err) {
      return json({ error: (err as Error).message });
    }
  };

  return { execute, proposals };
}
