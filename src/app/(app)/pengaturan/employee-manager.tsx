"use client";

import Link from "next/link";
import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DateInput } from "@/components/date-input";
import { Icon } from "@/components/icon";
import { applyEmployeeChanges } from "@/lib/actions/settings";
import type { BranchSetting, EmployeeSetting, RoleSetting } from "@/lib/data/settings";
import { formatDateLong, initials } from "@/lib/format";
import { BRANCH_TYPE_LABEL, CODE_MAX } from "@/lib/labels";
import { StatCard } from "./_components/settings-skeleton";
import { newId, useStaged } from "./_components/staged";
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
} from "./_components/ui";

const PER_PAGE = 10;

const CONTRACT: Record<EmployeeSetting["contract"], { label: string; long: string; cls: string }> = {
  tetap: { label: "Tetap", long: "Tetap (PKWTT)", cls: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" },
  pkwt: { label: "PKWT", long: "PKWT (Kontrak)", cls: "bg-cyan-500/10 text-cyan-300 border-cyan-500/30" },
  mitra: { label: "Mitra", long: "Kemitraan / Ritase", cls: "bg-amber-500/10 text-amber-300 border-amber-500/30" },
};

const AVATAR = [
  "bg-cyan-900/60 text-cyan-200 ring-cyan-500/40",
  "bg-indigo-900/60 text-indigo-200 ring-indigo-500/40",
  "bg-amber-900/50 text-amber-200 ring-amber-500/40",
];

/** "0812-3456 7890" / "62812…" / "812…" → "81234567890" */
function normalizePhone(v: string) {
  return v.replace(/\D/g, "").replace(/^62/, "").replace(/^0/, "");
}

function formatPhone(local: string) {
  if (!local) return "-";
  return `+62 ${local.slice(0, 3)}-${local.slice(3, 7)}-${local.slice(7)}`;
}

const emptyEmployee = (branchId: string, roleId: string): EmployeeSetting => ({
  id: newId(),
  nik: "",
  name: "",
  phone: "",
  contract: "tetap",
  joinDate: "",
  isActive: true,
  branchId,
  roleId,
  scheduled: null,
  moveDate: "",
  cancelScheduled: false,
});

export function EmployeeManager({
  employees,
  branches,
  roles,
}: {
  employees: EmployeeSetting[];
  branches: BranchSetting[];
  roles: RoleSetting[];
}) {
  const router = useRouter();
  const staged = useStaged(employees);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"" | "aktif" | "nonaktif">("");
  const [branchFilter, setBranchFilter] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<EmployeeSetting | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const [saving, startSaving] = useTransition();
  const clearToast = useCallback(() => setToast(null), []);
  useToastTimer(toast, clearToast);

  const branchById = new Map(branches.map((b) => [b.id, b]));
  const roleById = new Map(roles.map((r) => [r.id, r]));
  const activeBranches = branches.filter((b) => b.active);
  const activeRoles = roles.filter((r) => r.isActive);

  const q = query.trim().toLowerCase();
  const filtered = staged.rows.filter(
    (e) =>
      (!status || (status === "aktif") === e.isActive) &&
      (!branchFilter || e.branchId === branchFilter) &&
      (!q ||
        e.name.toLowerCase().includes(q) ||
        e.nik.toLowerCase().includes(q) ||
        (roleById.get(e.roleId)?.name.toLowerCase().includes(q) ?? false)),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * PER_PAGE, current * PER_PAGE);

  const activeCount = staged.rows.filter((e) => e.isActive).length;
  const placedBranches = new Set(staged.rows.filter((e) => e.isActive && e.branchId).map((e) => e.branchId)).size;

  const openNew = () => {
    setFormError(null);
    setEditing(emptyEmployee(branchFilter || activeBranches[0]?.id || "", activeRoles[0]?.id || ""));
  };

  const saveForm = () => {
    if (!editing) return;
    const e = { ...editing, nik: editing.nik.trim(), name: editing.name.trim(), phone: normalizePhone(editing.phone) };
    if (!e.nik || !e.name) return setFormError("NIK dan nama lengkap wajib diisi.");
    if (e.phone && !/^[0-9]{9,12}$/.test(e.phone)) return setFormError("No. WhatsApp harus 9–12 digit setelah +62.");
    if (!e.branchId || !e.roleId) return setFormError("Pilih cabang dan jabatan.");
    if (staged.rows.some((r) => r.id !== e.id && r.nik.toLowerCase() === e.nik.toLowerCase())) return setFormError(`NIK ${e.nik} sudah dipakai.`);
    staged.upsert(e);
    setEditing(null);
  };

  const apply = () =>
    startSaving(async () => {
      const res = await applyEmployeeChanges(staged.changes);
      if (res.ok) {
        setToast({ text: `${res.applied} perubahan karyawan diterapkan.`, error: false });
      } else {
        setToast({ text: res.applied ? `${res.error} (${res.applied} perubahan lain sudah tersimpan)` : res.error, error: true });
      }
      router.refresh();
    });

  const original = editing ? employees.find((e) => e.id === editing.id) : undefined;
  const isMutation = original && (original.branchId !== editing?.branchId || original.roleId !== editing?.roleId);

  return (
    <>
      <section aria-label="Ringkasan" className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total Staf Terdaftar" value={staged.rows.length} unit="Personil" note={`${activeCount} aktif • ${staged.rows.length - activeCount} nonaktif`} tone="cyan" />
        <StatCard
          label="Cabang Terdaftar"
          value={branches.length}
          unit="Outlet & Hub"
          note={`${placedBranches} cabang berisi staf aktif`}
          tone="emerald"
        />
        <StatCard
          label="Jabatan Terkonfigurasi"
          value={activeRoles.length}
          unit="Jabatan aktif"
          note={activeRoles.slice(0, 4).map((r) => r.code).join(", ") || "-"}
          tone="amber"
        />
      </section>

      {/* Filter */}
      <section aria-label="Filter" className="bg-panel border border-line rounded-2xl p-3 flex flex-col md:flex-row md:items-center gap-3 text-xs">
        <div className="relative md:w-72">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-gray-500 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            aria-label="Cari karyawan"
            placeholder="Cari nama, NIK, jabatan..."
            className={`${filterCls} w-full pl-9 pr-3 py-2 placeholder-gray-500`}
          />
        </div>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as typeof status);
            setPage(1);
          }}
          aria-label="Filter status"
          className={`${filterCls} py-2 px-3`}
        >
          <option value="">Semua Status (Aktif &amp; Nonaktif)</option>
          <option value="aktif">Hanya Aktif</option>
          <option value="nonaktif">Hanya Nonaktif</option>
        </select>
        <select
          value={branchFilter}
          onChange={(e) => {
            setBranchFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Filter cabang"
          className={`${filterCls} py-2 px-3`}
        >
          <option value="">Semua Hub</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.code} - {b.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={openNew}
          className="md:ml-auto flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-brand hover:bg-brand/90 text-black font-semibold shadow-[0_0_15px_rgba(0,210,255,0.25)] transition"
        >
          <Icon name="add" className="text-[16px]" />
          Tambah Karyawan
        </button>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Tabel karyawan */}
        <section aria-labelledby="karyawan-title" className="xl:col-span-8 bg-panel border border-line rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-line flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 id="karyawan-title" className="text-sm font-bold text-ink flex items-center gap-2">
                Master Karyawan &amp; Penugasan Hub
                <span className="text-[10px] px-2 py-0.5 rounded border border-cyan-500/40 text-cyan-300 bg-cyan-500/10">Live Edit Mode</span>
              </h2>
              <p className="text-[11px] text-gray-400 mt-0.5">Atur status keaktifan, kontrak kerja, dan penempatan cabang &amp; jabatan.</p>
            </div>
            {staged.dirty && (
              <span className="text-[11px] font-mono px-2 py-1 rounded border border-amber-500/40 text-amber-300">
                {staged.changes.length} Staf Diubah
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            {/* Responsif: kolom sekunder disembunyikan di layar sempit dan ditampilkan di bawah nama, jadi tabel tidak perlu digeser. */}
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-gray-400 border-b border-line">
                  <th scope="col" className="py-3 px-5 font-semibold">NIK / Nama Staf</th>
                  <th scope="col" className="py-3 px-4 font-semibold hidden md:table-cell">Cabang Penempatan</th>
                  <th scope="col" className="py-3 px-4 font-semibold hidden xl:table-cell">Status Kontrak</th>
                  <th scope="col" className="py-3 px-4 font-semibold hidden lg:table-cell">No. WA (+62)</th>
                  <th scope="col" className="py-3 px-3 font-semibold text-center">Aktif</th>
                  <th scope="col" className="py-3 px-3 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visible.map((e, i) => {
                  const b = branchById.get(e.branchId);
                  return (
                    <tr key={e.id} className={`hover:bg-panel-raised/50 transition ${e.isActive ? "" : "opacity-60"}`}>
                      <td className="py-3 px-4 sm:px-5 max-w-0 w-full md:w-auto md:max-w-none">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className={`w-8 h-8 rounded-full ring-1 font-bold flex items-center justify-center text-[11px] flex-shrink-0 ${AVATAR[i % AVATAR.length]}`}>
                            {initials(e.name || "?")}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-ink truncate">{e.name}</span>
                              <ChangeBadge isNew={staged.isNew(e.id)} changed={staged.isChanged(e.id)} />
                            </div>
                            <div className="text-[10px] font-mono text-gray-400 truncate">
                              {e.nik} • {roleById.get(e.roleId)?.name ?? "-"}
                            </div>
                            {/* Info kolom yang tersembunyi di layar sempit */}
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[10px] text-gray-400 xl:hidden">
                              <span className="md:hidden font-mono text-gray-300">{b ? b.code : "Belum ditempatkan"}</span>
                              <span className={`px-1.5 py-px rounded-full border font-semibold ${CONTRACT[e.contract].cls}`}>{CONTRACT[e.contract].label}</span>
                              <span className="lg:hidden font-mono">{formatPhone(e.phone)}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 hidden md:table-cell">
                        {b ? (
                          <div className="flex items-center gap-2.5 min-w-0 max-w-[240px]">
                            <span className="w-7 h-7 rounded-lg bg-cyan-500/10 text-brand-ink flex items-center justify-center flex-shrink-0">
                              <Icon name="warehouse" className="text-[16px]" />
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-semibold text-gray-200 truncate">{b.code}</span>
                                {!b.active && (
                                  <span className="text-[9px] px-1.5 py-px rounded bg-panel-raised text-gray-400 flex-shrink-0">Nonaktif</span>
                                )}
                              </div>
                              <div className="text-[10px] text-gray-400 truncate" title={`${b.name} · ${BRANCH_TYPE_LABEL[b.type]}`}>
                                {b.name} · {BRANCH_TYPE_LABEL[b.type]}
                              </div>
                              {e.scheduled && (
                                <div className="text-[10px] text-cyan-300 mt-0.5 whitespace-nowrap" title="Mutasi terjadwal">
                                  → {branchById.get(e.scheduled.branchId)?.code ?? "-"} mulai {formatDateLong(e.scheduled.from).replace(/^[^,]+, /, "")}
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-gray-500">
                            <Icon name="location_off" className="text-[15px]" />
                            Belum ditempatkan
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 hidden xl:table-cell">
                        <span className={`px-2 py-0.5 rounded-full border text-[11px] font-semibold ${CONTRACT[e.contract].cls}`}>
                          {CONTRACT[e.contract].label}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-gray-300 whitespace-nowrap hidden lg:table-cell">{formatPhone(e.phone)}</td>
                      <td className="py-3 px-3 text-center">
                        <Toggle checked={e.isActive} onChange={(v) => staged.patch(e.id, { isActive: v })} label={`Status aktif ${e.name}`} />
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          type="button"
                          title="Edit Staf"
                          aria-label={`Edit ${e.name}`}
                          onClick={() => {
                            setFormError(null);
                            setEditing(e);
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
                    <td colSpan={6} className="py-10 text-center text-gray-400">
                      {staged.rows.length === 0 ? "Belum ada karyawan. Klik \"Tambah Karyawan\"." : "Tidak ada staf yang cocok dengan filter."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-line flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-400">
            <span>
              Menampilkan {visible.length} dari {filtered.length} staf
            </span>
            <Pagination page={current} pages={pages} onPage={setPage} />
          </div>
        </section>

        {/* Ringkasan cabang & jabatan */}
        <aside className="xl:col-span-4 flex flex-col gap-6">
          <section aria-labelledby="cabang-mini" className="bg-panel border border-line rounded-2xl p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 id="cabang-mini" className="text-sm font-bold text-ink">Master Cabang &amp; Outlet</h2>
                <p className="text-[11px] text-gray-400">{activeBranches.length} cabang aktif</p>
              </div>
              <Link href="/pengaturan/cabang" aria-label="Kelola cabang" className="text-cyan-400 hover:text-cyan-300">
                <Icon name="arrow_forward" className="text-[20px]" />
              </Link>
            </div>
            {activeBranches.slice(0, 3).map((b) => (
              <div key={b.id} className="rounded-xl border border-line-strong bg-panel-raised p-3 flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 flex-shrink-0" />
                    <span className="font-bold text-sm text-ink">{b.code}</span>
                    <span className="text-[10px] px-1.5 py-px rounded border border-cyan-500/30 text-cyan-300 truncate">
                      {BRANCH_TYPE_LABEL[b.type]}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-gray-400 flex-shrink-0">{b.staffCount} Staf</span>
                </div>
                <div className="text-xs text-gray-300 truncate">{b.name}</div>
                <div className="flex items-center justify-between text-[10px] text-gray-400">
                  <span className="truncate">PIC: {staged.rows.find((e) => e.id === b.picId)?.name ?? "-"}</span>
                  <span className={b.is24 ? "text-emerald-400" : ""}>{b.is24 ? "Gate Buka: 24 Jam" : `Gate: ${b.open} - ${b.close}`}</span>
                </div>
              </div>
            ))}
            {activeBranches.length === 0 && <p className="text-xs text-gray-400">Belum ada cabang aktif.</p>}
          </section>

          <section aria-labelledby="jabatan-mini" className="bg-panel border border-line rounded-2xl p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 id="jabatan-mini" className="text-sm font-bold text-ink">Jabatan Karyawan</h2>
                <p className="text-[11px] text-gray-400">Distribusi staf per jabatan</p>
              </div>
              <Link href="/pengaturan/jabatan" aria-label="Kelola jabatan" className="text-cyan-400 hover:text-cyan-300">
                <Icon name="arrow_forward" className="text-[20px]" />
              </Link>
            </div>
            <ul className="flex flex-col gap-2">
              {[...activeRoles]
                .sort((a, b) => b.staffCount - a.staffCount)
                .slice(0, 5)
                .map((r) => (
                  <li key={r.id} className="flex items-center justify-between rounded-lg border border-line-strong bg-panel-raised px-3 py-2 text-xs">
                    <span className="text-gray-100 font-medium truncate">{r.name}</span>
                    <span className="text-[10px] font-mono text-cyan-300 flex-shrink-0">{r.staffCount} staf</span>
                  </li>
                ))}
            </ul>
          </section>
        </aside>
      </div>

      <ApplyBar
        count={staged.changes.length}
        saving={saving}
        onReset={staged.reset}
        onApply={apply}
        idleText="Semua data karyawan tersimpan"
      />

      <Modal
        open={editing !== null}
        title={editing && staged.isNew(editing.id) && !original ? "Tambah Karyawan" : "Edit Karyawan"}
        description="Data karyawan & penempatan cabang / jabatan"
        onClose={() => setEditing(null)}
        onSubmit={saveForm}
        submitLabel="Simpan ke Draf"
        error={formError}
      >
        {editing && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <Field label="NIK / ID Karyawan">
                <input
                  className={`${inputCls} font-mono`}
                  value={editing.nik}
                  onChange={(e) => setEditing({ ...editing, nik: e.target.value })}
                  maxLength={CODE_MAX}
                  required
                />
              </Field>
              <Field label="Nama Lengkap Staf">
                <input
                  className={inputCls}
                  placeholder="Nama lengkap personil..."
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  required
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <Field label="Jabatan Operasional">
                <SelectBox value={editing.roleId} onChange={(e) => setEditing({ ...editing, roleId: e.target.value })}>
                  <option value="">Pilih jabatan…</option>
                  {roles
                    .filter((r) => r.isActive || r.id === editing.roleId)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                </SelectBox>
              </Field>
              <Field label="Penempatan Cabang / Hub Induk">
                <SelectBox value={editing.branchId} onChange={(e) => setEditing({ ...editing, branchId: e.target.value })}>
                  <option value="">Pilih cabang…</option>
                  {branches
                    .filter((b) => b.active || b.id === editing.branchId)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.code} - {b.name}
                      </option>
                    ))}
                </SelectBox>
              </Field>
            </div>
            {original?.scheduled && !isMutation && (
              <div className="text-[11px] text-cyan-200 bg-cyan-950/30 border border-cyan-500/30 rounded-lg px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                <span>
                  Terjadwal pindah ke <b>{branchById.get(original.scheduled.branchId)?.code ?? "-"}</b> (
                  {roleById.get(original.scheduled.roleId)?.name ?? "-"}) mulai <b>{formatDateLong(original.scheduled.from)}</b>.
                </span>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editing.cancelScheduled}
                    onChange={(e) => setEditing({ ...editing, cancelScheduled: e.target.checked })}
                    className="accent-rose-500"
                  />
                  Batalkan jadwal pindah
                </label>
              </div>
            )}
            {isMutation && (
              <div className="text-[11px] text-amber-200 bg-amber-950/30 border border-amber-500/30 rounded-lg px-3 py-2.5 space-y-2">
                <p>
                  <b>Mutasi.</b> Penempatan lama ditutup sehari sebelum tanggal berlaku. Absensi lama tetap tercatat di cabang / jabatan lama.
                  Tanggal mendatang = pindah terjadwal; sampai tanggal itu karyawan tetap di cabang lama.
                </p>
                <Field label="Berlaku mulai" hint="Kosong = hari ini.">
                  <DateInput
                    className={`${inputCls} sm:max-w-[200px]`}
                    value={editing.moveDate}
                    onChange={(e) => setEditing({ ...editing, moveDate: e.target.value })}
                  />
                </Field>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <Field label="Nomor WhatsApp (+62)">
                <span className="relative block">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs font-mono text-cyan-400 pointer-events-none">+62</span>
                  <input
                    type="tel"
                    className={`${inputCls} pl-12 font-mono`}
                    placeholder="812-3456-7890"
                    value={editing.phone}
                    onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                  />
                </span>
              </Field>
              <Field label="Tanggal Bergabung" hint="Absensi bisa diisi mulai tanggal ini (kosong = mulai hari disimpan).">
                <DateInput
                  className={inputCls}
                  value={editing.joinDate}
                  onChange={(e) => setEditing({ ...editing, joinDate: e.target.value })}
                />
              </Field>
            </div>
            <fieldset>
              <legend className="block text-[11px] font-medium text-slate-300 mb-1.5">Tipe Hubungan Kontrak Kerja</legend>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {(Object.keys(CONTRACT) as EmployeeSetting["contract"][]).map((c) => (
                  <label
                    key={c}
                    className={`flex items-center justify-center gap-2 p-2 rounded-lg bg-panel-inset border cursor-pointer text-xs transition ${
                      editing.contract === c ? "border-cyan-500/60" : "border-line-strong hover:border-cyan-500/40"
                    }`}
                  >
                    <input
                      type="radio"
                      name="kontrak"
                      checked={editing.contract === c}
                      onChange={() => setEditing({ ...editing, contract: c })}
                      className="accent-cyan-400"
                    />
                    <span className="text-slate-200 font-medium">{CONTRACT[c].long}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex items-center justify-between rounded-lg bg-panel-inset border border-line-strong px-3 py-2.5">
              <span className="text-xs text-slate-300">Status aktif dinas</span>
              <Toggle checked={editing.isActive} onChange={(v) => setEditing({ ...editing, isActive: v })} label="Status aktif" />
            </div>
          </>
        )}
      </Modal>

      <Toast toast={toast} />
    </>
  );
}
