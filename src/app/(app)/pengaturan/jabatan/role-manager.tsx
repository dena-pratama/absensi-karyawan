"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { confirmDialog } from "@/components/confirm-dialog";
import { applyRoleChanges, deleteRole } from "@/lib/actions/settings";
import type { RoleSetting } from "@/lib/data/settings";
import { StatCard } from "../_components/settings-skeleton";
import { newId, useStaged } from "../_components/staged";
import { RowActions, ApplyBar, ChangeBadge, Field, filterCls, inputCls, Modal, Toast, Toggle, useToastTimer } from "../_components/ui";

export function RoleManager({
  roles,
  activeEmployees,
  mappedEmployees,
}: {
  roles: RoleSetting[];
  activeEmployees: number;
  mappedEmployees: number;
}) {
  const router = useRouter();
  const staged = useStaged(roles);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<RoleSetting | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const [saving, startSaving] = useTransition();
  const clearToast = useCallback(() => setToast(null), []);

  /** Baris baru (belum diterapkan) cukup dibuang; data tersimpan dihapus permanen di database. */
  const removeRow = async (id: string, label: string) => {
    if (staged.isNew(id)) return staged.remove(id);
    const ok = await confirmDialog({ title: `Hapus jabatan ${label}?`, message: "Data dihapus permanen dari database.", confirmLabel: "Hapus", tone: "danger" });
    if (!ok) return;
    startSaving(async () => {
      const res = await deleteRole(id);
      setToast(res.ok ? { text: `Jabatan ${label} dihapus.`, error: false } : { text: res.error, error: true });
      if (res.ok) router.refresh();
    });
  };
  useToastTimer(toast, clearToast);

  const q = query.trim().toLowerCase();
  const visible = staged.rows.filter((r) => !q || r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q));
  const active = staged.rows.filter((r) => r.isActive);
  const top = [...staged.rows].sort((a, b) => b.staffCount - a.staffCount)[0];
  const maxStaff = Math.max(1, ...staged.rows.map((r) => r.staffCount));
  const mappedPct = activeEmployees ? Math.round((mappedEmployees / activeEmployees) * 100) : 0;

  const saveForm = () => {
    if (!editing) return;
    const r = { ...editing, code: editing.code.trim().toUpperCase().replace(/\s+/g, "_"), name: editing.name.trim() };
    if (!/^[A-Z][A-Z0-9_]{1,29}$/.test(r.code)) return setFormError("Kode hanya huruf besar, angka, dan _ (cth: DRIVER_CDD).");
    if (!r.name) return setFormError("Nama jabatan wajib diisi.");
    if (staged.rows.some((x) => x.id !== r.id && x.code === r.code)) return setFormError(`Kode ${r.code} sudah dipakai.`);
    staged.upsert(r);
    setEditing(null);
  };

  const apply = () =>
    startSaving(async () => {
      const res = await applyRoleChanges(staged.changes);
      setToast(
        res.ok
          ? { text: `${res.applied} perubahan jabatan diterapkan.`, error: false }
          : { text: res.applied ? `${res.error} (${res.applied} perubahan lain sudah tersimpan)` : res.error, error: true },
      );
      router.refresh();
    });

  return (
    <>
      <section aria-label="Ringkasan jabatan" className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total Jabatan Aktif" value={active.length} unit="Jabatan" note={`${staged.rows.length - active.length} nonaktif`} tone="cyan" />
        <StatCard
          label="Staf Terpetakan"
          value={mappedEmployees}
          unit="Personil"
          note={`${mappedPct}% staf aktif punya jabatan`}
          tone="emerald"
        />
        <StatCard
          label="Jabatan Terbanyak"
          value={top?.staffCount ?? 0}
          unit="Staf"
          note={top && top.staffCount > 0 ? top.name : "Belum ada staf"}
          tone="amber"
        />
      </section>

      <section aria-labelledby="jabatan-title" className="bg-panel border border-line rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-line flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 id="jabatan-title" className="text-sm font-bold text-ink flex items-center gap-2">
              Daftar Master Jabatan
              <span className="text-[11px] font-mono text-cyan-300">{staged.rows.length} Konfigurasi</span>
            </h2>
            <p className="text-[11px] text-gray-400 mt-0.5">Jabatan hanya label karyawan (bukan hak akses). Jabatan nonaktif tidak muncul di pilihan form.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 text-xs">
            <div className="relative sm:w-60">
              <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-gray-500 pointer-events-none" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Cari jabatan"
                placeholder="Cari kode / nama jabatan..."
                className={`${filterCls} w-full pl-9 pr-3 py-2 placeholder-gray-500`}
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setFormError(null);
                setEditing({ id: newId(), code: "", name: "", isActive: true, staffCount: 0 });
              }}
              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-brand hover:bg-brand/90 text-black font-semibold shadow-[0_0_15px_rgba(0,210,255,0.25)] transition"
            >
              <Icon name="add" className="text-[16px]" />
              Tambah Jabatan
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse min-w-[640px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-gray-400 border-b border-line">
                <th scope="col" className="py-3 px-5 font-semibold">Kode</th>
                <th scope="col" className="py-3 px-4 font-semibold">Nama Jabatan</th>
                <th scope="col" className="py-3 px-4 font-semibold min-w-[200px]">Staf Terpetakan</th>
                <th scope="col" className="py-3 px-4 font-semibold text-center">Status Aktif</th>
                <th scope="col" className="py-3 px-4 font-semibold text-right w-px whitespace-nowrap">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visible.map((r) => (
                <tr key={r.id} className={`hover:bg-panel-raised/50 transition ${r.isActive ? "" : "opacity-60"}`}>
                  <td className="py-3 px-5 font-mono text-cyan-300">{r.code}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-ink">{r.name}</span>
                      <ChangeBadge isNew={staged.isNew(r.id)} changed={staged.isChanged(r.id)} />
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-1.5 rounded-full bg-panel-raised overflow-hidden">
                        <div className="h-full rounded-full bg-cyan-400" style={{ width: `${(r.staffCount / maxStaff) * 100}%` }} />
                      </div>
                      <span className="font-mono text-gray-200 w-14 text-right tabular-nums">{r.staffCount} staf</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <Toggle checked={r.isActive} onChange={(v) => staged.patch(r.id, { isActive: v })} label={`Status ${r.name}`} />
                  </td>
                  <td className="py-3 px-4 text-right w-px whitespace-nowrap">
                    <RowActions
                          label={r.name}
                          onEdit={() => {
                            setFormError(null);
                            setEditing(r);
                          }}
                          onDelete={() => removeRow(r.id, r.name)}
                          deleteDisabled={saving || (staged.dirty && !staged.isNew(r.id))}
                          deleteTitle={staged.dirty && !staged.isNew(r.id) ? "Terapkan atau reset perubahan dulu" : "Hapus"}
                        />
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-gray-400">
                    {staged.rows.length === 0 ? "Belum ada jabatan." : "Tidak ada jabatan yang cocok."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ApplyBar
        count={staged.changes.length}
        saving={saving}
        onReset={staged.reset}
        onApply={apply}
        idleText="Semua data jabatan tersimpan"
      />

      <Modal
        open={editing !== null}
        title={editing && !roles.some((r) => r.id === editing.id) ? "Tambah Jabatan" : "Edit Jabatan"}
        description="Jabatan operasional karyawan (label)"
        onClose={() => setEditing(null)}
        onSubmit={saveForm}
        submitLabel="Simpan ke Draf"
        error={formError}
      >
        {editing && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <Field label="Kode Jabatan" hint="Huruf besar, angka, _">
                <input
                  className={`${inputCls} font-mono uppercase`}
                  placeholder="Cth: DRIVER_CDD"
                  value={editing.code}
                  maxLength={30}
                  onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })}
                  required
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Nama Jabatan">
                  <input
                    className={inputCls}
                    placeholder="Contoh: Driver CDD / Feeder"
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    required
                  />
                </Field>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-panel-inset border border-line-strong px-3 py-2.5">
              <span className="text-xs text-slate-300">Jabatan aktif</span>
              <Toggle checked={editing.isActive} onChange={(v) => setEditing({ ...editing, isActive: v })} label="Jabatan aktif" />
            </div>
          </>
        )}
      </Modal>

      <Toast toast={toast} />
    </>
  );
}
