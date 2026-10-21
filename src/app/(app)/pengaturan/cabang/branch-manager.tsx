"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { applyBranchChanges } from "@/lib/actions/settings";
import type { BranchSetting, Option } from "@/lib/data/settings";
import { formatLatLng, GEOFENCE_DEFAULT_M, GEOFENCE_MAX_M, GEOFENCE_MIN_M } from "@/lib/geo";
import { BRANCH_TYPE_LABEL, CODE_MAX, type BranchType } from "@/lib/labels";
import { newId, useStaged } from "../_components/staged";
import { GeoAreaField } from "./geo-area-field";
import {
  ApplyBar,
  ChangeBadge,
  Field,
  filterCls,
  inputCls,
  Modal,
  Pagination,
  SelectBox,
  Toast,
  Toggle,
  useToastTimer,
} from "../_components/ui";

export type AuditView = { id: number; text: string; subject: string; when: string };

const PER_PAGE = 8;
const TYPES = Object.keys(BRANCH_TYPE_LABEL) as BranchType[];

const GATE_PRESETS = [
  { label: "24 Jam Penuh (Non-Stop Hub)", is24: true, open: "", close: "" },
  { label: "06:00 - 22:00 WIB (Drop Point)", is24: false, open: "06:00", close: "22:00" },
  { label: "08:00 - 20:00 WIB (Outlet Reguler)", is24: false, open: "08:00", close: "20:00" },
];

const emptyBranch = (): BranchSetting => ({
  id: newId(),
  code: "",
  name: "",
  type: "drop_point",
  clusterId: "",
  address: "",
  picId: "",
  is24: false,
  open: "08:00",
  close: "20:00",
  active: true,
  originalStatus: "aktif",
  staffCount: 0,
  point: null,
  radius: GEOFENCE_DEFAULT_M,
});

function csvCell(v: string | number) {
  const s = String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function BranchManager({
  branches,
  geoReady,
  clusters,
  employees,
  audit,
}: {
  branches: BranchSetting[];
  /** false = migrasi branch_geofence belum dijalankan (area GPS belum bisa diatur). */
  geoReady: boolean;
  clusters: Option[];
  employees: Option[];
  audit: AuditView[];
}) {
  const router = useRouter();
  const staged = useStaged(branches);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [cluster, setCluster] = useState("");
  const [status, setStatus] = useState<"" | "aktif" | "nonaktif">("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<BranchSetting | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const [saving, startSaving] = useTransition();
  const clearToast = useCallback(() => setToast(null), []);
  useToastTimer(toast, clearToast);

  const employeeById = new Map(employees.map((e) => [e.id, e]));
  const clusterById = new Map(clusters.map((c) => [c.id, c.label]));

  const q = query.trim().toLowerCase();
  const filtered = staged.rows.filter(
    (b) =>
      (!type || b.type === type) &&
      (!cluster || b.clusterId === cluster) &&
      (!status || (status === "aktif") === b.active) &&
      (!q || b.code.toLowerCase().includes(q) || b.name.toLowerCase().includes(q) || b.address.toLowerCase().includes(q)),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * PER_PAGE, current * PER_PAGE);
  const resetPage = () => setPage(1);

  const saveForm = () => {
    if (!editing) return;
    const b = { ...editing, code: editing.code.trim(), name: editing.name.trim() };
    if (!b.code) return setFormError("Kode cabang wajib diisi.");
    if (!b.name) return setFormError("Nama cabang wajib diisi.");
    if (!b.is24 && (!b.open || !b.close)) return setFormError("Isi jam buka & tutup gate, atau pilih 24 jam.");
    if (b.radius < GEOFENCE_MIN_M || b.radius > GEOFENCE_MAX_M) return setFormError(`Radius GPS harus ${GEOFENCE_MIN_M}–${GEOFENCE_MAX_M} meter.`);
    if (staged.rows.some((r) => r.id !== b.id && r.code.toLowerCase() === b.code.toLowerCase())) return setFormError(`Kode ${b.code} sudah dipakai.`);
    staged.upsert(b);
    setEditing(null);
  };

  const apply = () =>
    startSaving(async () => {
      const res = await applyBranchChanges(staged.changes, geoReady);
      setToast(
        res.ok
          ? { text: `${res.applied} perubahan cabang diterapkan.`, error: false }
          : { text: res.applied ? `${res.error} (${res.applied} perubahan lain sudah tersimpan)` : res.error, error: true },
      );
      router.refresh();
    });

  const exportCsv = () => {
    const header = ["Kode", "Nama", "Tipe", "Cluster", "Alamat", "PIC", "Jam Gate", "Status", "Jumlah Staf", "Titik GPS", "Radius GPS (m)"];
    const lines = filtered.map((b) => [
      b.code,
      b.name,
      BRANCH_TYPE_LABEL[b.type],
      clusterById.get(b.clusterId) ?? "",
      b.address,
      employeeById.get(b.picId)?.label ?? "",
      b.is24 ? "24 Jam" : `${b.open} - ${b.close}`,
      b.active ? "Aktif" : "Nonaktif",
      b.staffCount,
      b.point ? formatLatLng(b.point) : "",
      b.radius,
    ]);
    const csv = "﻿" + [header, ...lines].map((l) => l.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "data-cabang.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const presetIndex = editing
    ? GATE_PRESETS.findIndex((p) => p.is24 === editing.is24 && (p.is24 || (p.open === editing.open && p.close === editing.close)))
    : -1;

  return (
    <>
      {/* Filter */}
      <section aria-label="Filter cabang" className="bg-panel border border-line rounded-2xl p-3 flex flex-col lg:flex-row lg:items-center gap-3 text-xs">
        <div className="relative lg:w-72">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-gray-500 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              resetPage();
            }}
            aria-label="Cari cabang"
            placeholder="Cari kode, nama cabang, atau alamat..."
            className={`${filterCls} w-full pl-9 pr-3 py-2 placeholder-gray-500`}
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <select value={type} onChange={(e) => (setType(e.target.value), resetPage())} aria-label="Filter tipe" className={`${filterCls} py-2 px-3`}>
            <option value="">Semua Tipe Hub</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {BRANCH_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
          <select value={cluster} onChange={(e) => (setCluster(e.target.value), resetPage())} aria-label="Filter wilayah" className={`${filterCls} py-2 px-3`}>
            <option value="">Semua Wilayah</option>
            {clusters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => (setStatus(e.target.value as typeof status), resetPage())}
            aria-label="Filter status"
            className={`${filterCls} py-2 px-3`}
          >
            <option value="">Semua Status</option>
            <option value="aktif">Aktif</option>
            <option value="nonaktif">Nonaktif</option>
          </select>
        </div>
        <div className="flex gap-2 lg:ml-auto">
          <button
            type="button"
            onClick={exportCsv}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-line-strong bg-panel-raised text-gray-200 hover:text-brand-ink hover:border-brand/40 transition"
          >
            <Icon name="download" className="text-[16px]" />
            Ekspor CSV
          </button>
          <button
            type="button"
            onClick={() => {
              setFormError(null);
              setEditing(emptyBranch());
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand hover:bg-brand/90 text-black font-semibold shadow-[0_0_15px_rgba(0,210,255,0.25)] transition"
          >
            <Icon name="add" className="text-[16px]" />
            Tambah Cabang
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <section aria-labelledby="cabang-title" className="xl:col-span-9 bg-panel border border-line rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-line flex items-center gap-3">
            <Icon name="location_city" className="text-[18px] text-cyan-400" />
            <h2 id="cabang-title" className="text-sm font-bold text-ink">
              Daftar Titik Operasional &amp; Hub Logistik
            </h2>
            <span className="text-[11px] font-mono text-cyan-300">{staged.rows.length} Unit</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse min-w-[820px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-gray-400 border-b border-line">
                  <th scope="col" className="py-3 px-5 font-semibold">Kode &amp; Nama Hub</th>
                  <th scope="col" className="py-3 px-4 font-semibold">Tipe &amp; Lokasi</th>
                  <th scope="col" className="py-3 px-4 font-semibold">Penanggung Jawab (PIC)</th>
                  <th scope="col" className="py-3 px-4 font-semibold">Staf</th>
                  <th scope="col" className="py-3 px-4 font-semibold">Jam Gate</th>
                  <th scope="col" className="py-3 px-4 font-semibold text-center">Status</th>
                  <th scope="col" className="py-3 px-4 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visible.map((b) => {
                  const pic = employeeById.get(b.picId);
                  return (
                    <tr key={b.id} className={`hover:bg-panel-raised/50 transition align-top ${b.active ? "" : "opacity-60"}`}>
                      <td className="py-3 px-5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-ink">{b.code}</span>
                          <ChangeBadge isNew={staged.isNew(b.id)} changed={staged.isChanged(b.id)} />
                        </div>
                        <div className="text-gray-300 mt-0.5">{b.name}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-gray-100">{BRANCH_TYPE_LABEL[b.type]}</div>
                        <div className="text-gray-400 mt-0.5 max-w-[220px]">{b.address || clusterById.get(b.clusterId) || "-"}</div>
                        {geoReady && (
                          <div
                            className={`mt-1 inline-flex items-center gap-1 text-[10px] ${b.point ? "text-emerald-400" : "text-gray-500"}`}
                            title={b.point ? formatLatLng(b.point) : undefined}
                          >
                            <Icon name={b.point ? "my_location" : "location_off"} className="text-[13px]" />
                            {b.point ? `GPS · radius ${b.radius} m` : "GPS belum diatur"}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {pic ? (
                          <>
                            <div className="font-semibold text-gray-100">{pic.label.replace(/ \(.*\)$/, "")}</div>
                            <div className="text-gray-400 mt-0.5">{pic.sub || "-"}</div>
                          </>
                        ) : (
                          <span className="text-gray-500">Belum ditentukan</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-gray-200">
                        {b.staffCount} <span className="text-gray-500 font-sans">staf</span>
                      </td>
                      <td className="py-3 px-4 font-mono whitespace-nowrap">
                        {b.is24 ? <span className="text-emerald-400">24 Jam Buka</span> : `${b.open} - ${b.close}`}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Toggle checked={b.active} onChange={(v) => staged.patch(b.id, { active: v })} label={`Status ${b.code}`} />
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          title="Edit Hub"
                          aria-label={`Edit ${b.code}`}
                          onClick={() => {
                            setFormError(null);
                            setEditing(b);
                          }}
                          className="p-1 text-gray-400 hover:text-cyan-400 transition"
                        >
                          <Icon name="edit_square" className="text-[18px]" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-gray-400">
                      {staged.rows.length === 0 ? "Belum ada cabang. Klik \"Tambah Cabang\"." : "Tidak ada cabang yang cocok dengan filter."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-line flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-400">
            <span>
              Menampilkan {visible.length} dari {filtered.length} cabang operasional
            </span>
            <Pagination page={current} pages={pages} onPage={setPage} />
          </div>
        </section>

        <aside aria-labelledby="log-title" className="xl:col-span-3 bg-panel border border-line rounded-2xl p-5 flex flex-col gap-3 self-start">
          <h2 id="log-title" className="text-xs font-bold uppercase tracking-wider text-gray-200">
            Log Perubahan Terkini
          </h2>
          {audit.length ? (
            <ol className="flex flex-col gap-3">
              {audit.map((a) => (
                <li key={a.id} className="flex gap-2.5 text-xs">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-cyan-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-gray-300">
                      <span className="font-semibold text-ink">{a.text}</span>{" "}
                      <span className="text-cyan-300 break-words">{a.subject}</span>
                    </p>
                    <p className="text-[10px] text-gray-500 mt-0.5">{a.when}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-xs text-gray-400">Belum ada perubahan tercatat.</p>
          )}
        </aside>
      </div>

      <ApplyBar
        count={staged.changes.length}
        saving={saving}
        onReset={staged.reset}
        onApply={apply}
        idleText="Semua data cabang tersimpan"
      />

      <Modal
        open={editing !== null}
        title={editing && !branches.some((b) => b.id === editing.id) ? "Tambah Cabang / Outlet" : "Edit Cabang / Outlet"}
        description="Data titik operasional & hub ekspedisi"
        onClose={() => setEditing(null)}
        onSubmit={saveForm}
        submitLabel="Simpan ke Draf"
        error={formError}
      >
        {editing && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <Field label="Kode Cabang / Hub">
                <input
                  className={`${inputCls} font-mono`}
                  value={editing.code}
                  maxLength={CODE_MAX}
                  onChange={(e) => setEditing({ ...editing, code: e.target.value })}
                  required
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Nama Cabang / Outlet">
                  <input
                    className={inputCls}
                    placeholder="Contoh: Hub Transit Ciledug Gateway"
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    required
                  />
                </Field>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <Field label="Tipe Fasilitas Operasional">
                <SelectBox value={editing.type} onChange={(e) => setEditing({ ...editing, type: e.target.value as BranchType })}>
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {BRANCH_TYPE_LABEL[t]}
                    </option>
                  ))}
                </SelectBox>
              </Field>
              <Field label="Cluster & Wilayah Layanan">
                <SelectBox value={editing.clusterId} onChange={(e) => setEditing({ ...editing, clusterId: e.target.value })}>
                  <option value="">Tanpa cluster</option>
                  {clusters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </SelectBox>
              </Field>
            </div>
            <Field label="PIC Penanggung Jawab" hint="Dipilih dari karyawan aktif">
              <SelectBox value={editing.picId} onChange={(e) => setEditing({ ...editing, picId: e.target.value })}>
                <option value="">Belum ditentukan</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                    {e.sub ? ` · ${e.sub}` : ""}
                  </option>
                ))}
              </SelectBox>
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <Field label="Jam Operasional Gate">
                <SelectBox
                  value={presetIndex === -1 ? "custom" : String(presetIndex)}
                  onChange={(e) => {
                    const p = GATE_PRESETS[Number(e.target.value)];
                    if (p) setEditing({ ...editing, is24: p.is24, open: p.open, close: p.close });
                    else setEditing({ ...editing, is24: false });
                  }}
                >
                  {GATE_PRESETS.map((p, i) => (
                    <option key={p.label} value={i}>
                      {p.label}
                    </option>
                  ))}
                  <option value="custom">Atur jam sendiri…</option>
                </SelectBox>
              </Field>
              <Field label="Jam Buka">
                <input
                  type="time"
                  className={`${inputCls} [color-scheme:dark]`}
                  value={editing.open}
                  disabled={editing.is24}
                  onChange={(e) => setEditing({ ...editing, is24: false, open: e.target.value })}
                />
              </Field>
              <Field label="Jam Tutup">
                <input
                  type="time"
                  className={`${inputCls} [color-scheme:dark]`}
                  value={editing.close}
                  disabled={editing.is24}
                  onChange={(e) => setEditing({ ...editing, is24: false, close: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Alamat Lengkap Fasilitas Hub">
              <textarea
                rows={2}
                className={inputCls}
                placeholder="Alamat jalan, pergudangan, patokan gate..."
                value={editing.address}
                onChange={(e) => setEditing({ ...editing, address: e.target.value })}
              />
            </Field>
            <GeoAreaField
              key={editing.id}
              point={editing.point}
              radius={editing.radius}
              disabled={!geoReady}
              onChange={(v) => setEditing({ ...editing, ...v })}
            />
            {!geoReady && (
              <p className="text-[11px] text-amber-300 -mt-2">
                Jalankan <code className="font-mono">supabase/migrations/20261021010000_branch_geofence.sql</code> di Supabase untuk mengaktifkan area GPS.
              </p>
            )}
            <div className="flex items-center justify-between rounded-lg bg-panel-inset border border-line-strong px-3 py-2.5">
              <span className="text-xs text-slate-300">Cabang aktif</span>
              <Toggle checked={editing.active} onChange={(v) => setEditing({ ...editing, active: v })} label="Cabang aktif" />
            </div>
          </>
        )}
      </Modal>

      <Toast toast={toast} />
    </>
  );
}
