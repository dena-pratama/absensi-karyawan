"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DateInput } from "@/components/date-input";
import { Icon } from "@/components/icon";
import { deleteBackup, saveBackup, type BackupInput } from "@/lib/actions/backup";
import type { BackupRow } from "@/lib/data/backup";
import { formatDateLong } from "@/lib/format";
import { Field, Modal, Pagination, SelectBox, Toast, filterCls, inputCls, useToastTimer } from "../_components/ui";

type EmployeeOption = { id: string; label: string; sub: string; branchId: string };
type Option = { id: string; label: string };
type Period = "aktif" | "riwayat" | "semua";

const PER_PAGE = 10;

/** "21 Okt" / "21–23 Okt 2026" — ringkas untuk tabel. */
function rangeLabel(from: string, to: string) {
  const f = formatDateLong(from).replace(/^[^,]+, /, "");
  if (from === to) return f;
  return `${formatDateLong(from).replace(/^[^,]+, /, "").replace(/ \d{4}$/, "")} – ${formatDateLong(to).replace(/^[^,]+, /, "")}`;
}

function dayCount(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

export function BackupManager({
  ready,
  today,
  backups,
  employees,
  branches,
}: {
  ready: boolean;
  today: string;
  backups: BackupRow[];
  employees: EmployeeOption[];
  branches: Option[];
}) {
  const router = useRouter();
  const [period, setPeriod] = useState<Period>("aktif");
  const [branch, setBranch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<BackupInput | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, startBusy] = useTransition();
  const clearToast = useCallback(() => setToast(null), []);
  useToastTimer(toast, clearToast);

  const q = query.trim().toLowerCase();
  const filtered = backups.filter(
    (b) =>
      (period === "semua" || (period === "aktif" ? b.dateTo >= today : b.dateTo < today)) &&
      (!branch || b.toBranchId === branch || b.fromBranchId === branch) &&
      (!q || b.name.toLowerCase().includes(q) || b.nik.toLowerCase().includes(q)),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * PER_PAGE, current * PER_PAGE);
  const activeToday = backups.filter((b) => b.dateFrom <= today && b.dateTo >= today).length;
  const upcoming = backups.filter((b) => b.dateFrom > today).length;

  const empHome = new Map(employees.map((e) => [e.id, e]));
  const editingEmployee = editing ? empHome.get(editing.employeeId) : undefined;

  const openNew = () => {
    setFormError(null);
    setEditing({ id: null, employeeId: "", toBranchId: "", dateFrom: today, dateTo: today, note: "" });
  };

  const submit = () =>
    startBusy(async () => {
      if (!editing) return;
      if (editingEmployee && editingEmployee.branchId === editing.toBranchId)
        return setFormError("Cabang tujuan sama dengan cabang asal karyawan.");
      const res = await saveBackup(editing);
      if (!res.ok) return setFormError(res.error);
      setEditing(null);
      setToast({ text: editing.id ? "Penugasan backup diperbarui." : "Penugasan backup ditambahkan.", error: false });
      router.refresh();
    });

  const remove = (b: BackupRow) => {
    if (!window.confirm(`Hapus penugasan backup ${b.name} ke ${b.toCode} (${rangeLabel(b.dateFrom, b.dateTo)})?`)) return;
    startBusy(async () => {
      const res = await deleteBackup(b.id);
      setToast(res.ok ? { text: "Penugasan backup dihapus.", error: false } : { text: res.error, error: true });
      router.refresh();
    });
  };

  if (!ready) {
    return (
      <div role="alert" className="rounded-2xl border border-amber-500/40 bg-amber-950/30 p-4 text-xs text-amber-200 flex gap-3">
        <Icon name="warning" className="text-[20px] text-amber-400 flex-shrink-0" />
        <p>
          Fitur backup belum aktif. Jalankan <code className="font-mono">supabase/migrations/20261022000000_backup_and_multi_branch_spv.sql</code> di
          SQL Editor Supabase, lalu muat ulang halaman.
        </p>
      </div>
    );
  }

  return (
    <>
      <section aria-label="Ringkasan backup" className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: "Sedang backup hari ini", value: activeToday, tone: "text-purple-300" },
          { label: "Terjadwal (akan datang)", value: upcoming, tone: "text-brand-ink" },
          { label: "Total 90 hari terakhir", value: backups.length, tone: "text-ink" },
        ].map((s) => (
          <div key={s.label} className="bg-panel border border-line rounded-2xl p-4">
            <div className="text-[11px] text-gray-400">{s.label}</div>
            <div className={`text-2xl font-bold mt-1 tabular-nums ${s.tone}`}>{s.value}</div>
            <div className="text-[10px] text-gray-500 mt-0.5">penugasan</div>
          </div>
        ))}
      </section>

      <section aria-labelledby="backup-title" className="bg-panel border border-line rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-line flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 id="backup-title" className="text-sm font-bold text-ink">Penugasan Backup Karyawan</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Karyawan dipinjam sementara ke cabang lain. Selama backup, absensinya dicatat & dihitung di cabang tujuan, lalu otomatis kembali ke
              cabang asal.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 text-xs">
            <div className="relative sm:w-48">
              <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-gray-500 pointer-events-none" />
              <input
                type="search"
                value={query}
                onChange={(e) => (setQuery(e.target.value), setPage(1))}
                aria-label="Cari karyawan"
                placeholder="Cari nama / NIK..."
                className={`${filterCls} w-full pl-9 pr-3 py-2 placeholder-gray-500`}
              />
            </div>
            <select value={period} onChange={(e) => (setPeriod(e.target.value as Period), setPage(1))} aria-label="Filter periode" className={`${filterCls} py-2 px-3`}>
              <option value="aktif">Aktif & akan datang</option>
              <option value="riwayat">Riwayat (selesai)</option>
              <option value="semua">Semua</option>
            </select>
            <select value={branch} onChange={(e) => (setBranch(e.target.value), setPage(1))} aria-label="Filter cabang" className={`${filterCls} py-2 px-3`}>
              <option value="">Semua cabang</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={openNew}
              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-brand hover:bg-brand/90 text-black font-semibold shadow-[0_0_15px_rgba(0,210,255,0.25)] transition"
            >
              <Icon name="add" className="text-[16px]" />
              Tambah Backup
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse min-w-[760px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-gray-400 border-b border-line">
                <th scope="col" className="py-3 px-5 font-semibold">Karyawan</th>
                <th scope="col" className="py-3 px-4 font-semibold">Dari → Ke</th>
                <th scope="col" className="py-3 px-4 font-semibold">Tanggal</th>
                <th scope="col" className="py-3 px-4 font-semibold">Status</th>
                <th scope="col" className="py-3 px-4 font-semibold">Keterangan</th>
                <th scope="col" className="py-3 px-4 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visible.map((b) => {
                const status =
                  b.dateTo < today
                    ? { label: "Selesai", cls: "bg-panel-raised text-gray-400" }
                    : b.dateFrom > today
                      ? { label: "Terjadwal", cls: "bg-cyan-500/10 text-cyan-300" }
                      : { label: "Berlangsung", cls: "bg-purple-500/15 text-purple-300" };
                return (
                  <tr key={b.id} className="hover:bg-panel-raised/50 transition">
                    <td className="py-3 px-5">
                      <div className="font-semibold text-ink">{b.name}</div>
                      <div className="text-[10px] font-mono text-gray-400">{b.nik}</div>
                    </td>
                    <td className="py-3 px-4 font-mono whitespace-nowrap">
                      <span className="text-gray-400">{b.fromCode}</span>
                      <Icon name="arrow_forward" className="text-[13px] text-gray-500 mx-1 align-middle" />
                      <span className="font-semibold text-gray-100">{b.toCode}</span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="text-gray-200">{rangeLabel(b.dateFrom, b.dateTo)}</div>
                      <div className="text-[10px] text-gray-500">{dayCount(b.dateFrom, b.dateTo)} hari</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${status.cls}`}>{status.label}</span>
                    </td>
                    <td className="py-3 px-4 text-gray-400 max-w-[200px] truncate" title={b.note}>
                      {b.note || "-"}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        aria-label={`Edit backup ${b.name}`}
                        onClick={() => {
                          setFormError(null);
                          setEditing({ id: b.id, employeeId: b.employeeId, toBranchId: b.toBranchId, dateFrom: b.dateFrom, dateTo: b.dateTo, note: b.note });
                        }}
                        className="p-1 text-gray-400 hover:text-cyan-400 transition"
                      >
                        <Icon name="edit_square" className="text-[18px]" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Hapus backup ${b.name}`}
                        onClick={() => remove(b)}
                        disabled={busy}
                        className="p-1 text-gray-400 hover:text-rose-400 transition disabled:opacity-50"
                      >
                        <Icon name="delete" className="text-[18px]" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-gray-400">
                    {backups.length === 0 ? 'Belum ada penugasan backup. Klik "Tambah Backup".' : "Tidak ada penugasan yang cocok dengan filter."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-line flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-400">
            <span>
              Menampilkan {visible.length} dari {filtered.length} penugasan
            </span>
            <Pagination page={current} pages={pages} onPage={setPage} />
          </div>
        )}
      </section>

      <Modal
        open={editing !== null}
        title={editing?.id ? "Edit Penugasan Backup" : "Tambah Penugasan Backup"}
        description="Selama rentang tanggal ini, karyawan absen & dihitung di cabang tujuan."
        onClose={() => setEditing(null)}
        onSubmit={submit}
        submitLabel={busy ? "Menyimpan..." : "Simpan"}
        error={formError}
      >
        {editing && (
          <>
            <Field label="Karyawan" hint={editingEmployee ? `Cabang asal: ${editingEmployee.sub}` : "Dipilih dari karyawan aktif yang sudah ditempatkan."}>
              <SelectBox value={editing.employeeId} onChange={(e) => setEditing({ ...editing, employeeId: e.target.value })} required>
                <option value="">— Pilih karyawan —</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label} — {e.sub}
                  </option>
                ))}
              </SelectBox>
            </Field>
            <Field label="Cabang tujuan">
              <SelectBox value={editing.toBranchId} onChange={(e) => setEditing({ ...editing, toBranchId: e.target.value })} required>
                <option value="">— Pilih cabang tujuan —</option>
                {branches
                  .filter((b) => b.id !== editingEmployee?.branchId)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
              </SelectBox>
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <Field label="Tanggal mulai">
                <DateInput
                  className={inputCls}
                  value={editing.dateFrom}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) setEditing({ ...editing, dateFrom: v, dateTo: editing.dateTo < v ? v : editing.dateTo });
                  }}
                  required
                />
              </Field>
              <Field label="Tanggal selesai" hint={`${dayCount(editing.dateFrom, editing.dateTo)} hari. Sama dengan tanggal mulai = backup 1 hari.`}>
                <DateInput
                  className={inputCls}
                  value={editing.dateTo}
                  min={editing.dateFrom}
                  onChange={(e) => e.target.value && setEditing({ ...editing, dateTo: e.target.value })}
                  required
                />
              </Field>
            </div>
            <Field label="Keterangan (opsional)">
              <input
                className={inputCls}
                value={editing.note}
                maxLength={200}
                onChange={(e) => setEditing({ ...editing, note: e.target.value })}
                placeholder="mis. Bantu volume tinggi akhir bulan"
              />
            </Field>
          </>
        )}
      </Modal>

      <Toast toast={toast} />
    </>
  );
}
