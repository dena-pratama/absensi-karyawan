"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { saveDayOffSettings } from "@/lib/actions/day-off";
import type { DayOffSettings } from "@/lib/data/day-off";
import { SearchSelect } from "../../pengaturan/_components/search-select";
import { ApplyBar, Field, Toast, inputCls, useToastTimer } from "../../pengaturan/_components/ui";

type Option = { id: string; label: string };
type Override = { employeeId: string; name: string; nik: string; days: number };

const parseDays = (v: string) => (v.trim() === "" ? null : Math.max(0, Math.min(31, Math.trunc(Number(v.replace(/\D/g, "")) || 0))));

export function DayOffSettingsForm({ settings, employees }: { settings: { ready: false } | ({ ready: true } & DayOffSettings); employees: Option[] }) {
  if (!settings.ready) {
    return (
      <div role="alert" className="rounded-2xl border border-amber-500/40 bg-amber-950/30 p-4 text-xs text-amber-200 flex gap-3">
        <Icon name="warning" className="text-[20px] text-amber-400 flex-shrink-0" />
        <p>
          Fitur libur belum aktif. Jalankan <code className="font-mono">supabase/migrations/20261101000000_day_off.sql</code> di SQL Editor Supabase.
        </p>
      </div>
    );
  }
  return <Form initial={settings} employees={employees} />;
}

function Form({ initial, employees }: { initial: DayOffSettings; employees: Option[] }) {
  const router = useRouter();
  const [valid, setValid] = useState(initial.compValidDays);
  const [roleDays, setRoleDays] = useState<Record<string, number | null>>(() => Object.fromEntries(initial.roles.map((r) => [r.id, r.days])));
  const [overrides, setOverrides] = useState<Override[]>(initial.overrides);
  const [pick, setPick] = useState("");
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const [saving, start] = useTransition();
  const clearToast = useCallback(() => setToast(null), []);
  useToastTimer(toast, clearToast);

  const initialOverride = useMemo(() => new Map(initial.overrides.map((o) => [o.employeeId, o.days])), [initial.overrides]);
  const roleChanges = initial.roles.filter((r) => (roleDays[r.id] ?? null) !== r.days).map((r) => ({ id: r.id, days: roleDays[r.id] ?? null }));
  const overrideChanges = [
    ...overrides.filter((o) => initialOverride.get(o.employeeId) !== o.days).map((o) => ({ employeeId: o.employeeId, days: o.days as number | null })),
    ...initial.overrides.filter((o) => !overrides.some((x) => x.employeeId === o.employeeId)).map((o) => ({ employeeId: o.employeeId, days: null })),
  ];
  const changeCount = Number(valid !== initial.compValidDays) + roleChanges.length + overrideChanges.length;

  const reset = () => {
    setValid(initial.compValidDays);
    setRoleDays(Object.fromEntries(initial.roles.map((r) => [r.id, r.days])));
    setOverrides(initial.overrides);
  };
  const apply = () =>
    start(async () => {
      const res = await saveDayOffSettings({ compValidDays: valid, roles: roleChanges, overrides: overrideChanges });
      setToast(res.ok ? { text: "Pengaturan jatah libur disimpan.", error: false } : { text: res.error, error: true });
      if (res.ok) router.refresh();
    });
  const addOverride = (id: string) => {
    const e = employees.find((x) => x.id === id);
    if (!e || overrides.some((o) => o.employeeId === id)) return;
    setOverrides([{ employeeId: id, name: e.label.replace(/\s*\([^)]+\)$/, ""), nik: e.label.match(/\(([^)]+)\)$/)?.[1] ?? "-", days: 4 }, ...overrides]);
    setPick("");
  };
  const used = new Set(overrides.map((o) => o.employeeId));

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] gap-6 items-start">
        <section className="bg-panel border border-line rounded-2xl p-5 flex flex-col gap-4 lg:order-2">
          <div>
            <h2 className="text-sm font-bold text-ink flex items-center gap-2">
              <Icon name="beach_access" className="text-[18px] text-sky-300" />
              Aturan Libur
            </h2>
            <p className="text-[11px] text-gray-400 mt-0.5">Jatah dihitung per periode gajian (cut-off di Pengaturan Kasbon).</p>
          </div>
          <Field label="Masa berlaku off pengganti (hari)" hint="Saldo dari masuk di hari libur hangus setelah sekian hari.">
            <input
              type="number"
              min={1}
              max={365}
              className={inputCls}
              value={valid}
              onChange={(e) => setValid(Math.max(1, Math.min(365, Math.trunc(Number(e.target.value) || 1))))}
            />
          </Field>
          <ul className="text-[11px] text-gray-400 space-y-1.5">
            <li className="flex gap-2"><Icon name="check" className="text-[14px] text-emerald-400" />Masuk di hari libur tetap bisa, status jadi Hadir + 1 saldo off pengganti.</li>
            <li className="flex gap-2"><Icon name="check" className="text-[14px] text-emerald-400" />Libur tidak bisa bentrok dengan jadwal backup.</li>
            <li className="flex gap-2"><Icon name="check" className="text-[14px] text-emerald-400" />Pindah off &amp; tukar off tidak memotong jatah lagi.</li>
          </ul>
        </section>

        <div className="flex flex-col gap-6 min-w-0">
          <section className="bg-panel border border-line rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-line">
              <h2 className="text-sm font-bold text-ink">Jatah Libur per Jabatan</h2>
              <p className="text-[11px] text-gray-400 mt-0.5">Hari libur per periode gajian. Kosongkan = 0 (tidak ada jatah).</p>
            </div>
            <ul className="divide-y divide-line">
              {initial.roles.map((r) => (
                <li key={r.id} className="px-5 py-2.5 flex items-center justify-between gap-4 text-xs">
                  <span className="text-gray-200 truncate">{r.name}</span>
                  <span className="flex items-center gap-2 flex-shrink-0">
                    <input
                      inputMode="numeric"
                      aria-label={`Jatah libur ${r.name}`}
                      className={`${inputCls} w-20 text-right tabular-nums`}
                      value={roleDays[r.id] ?? ""}
                      placeholder="0"
                      onChange={(e) => setRoleDays({ ...roleDays, [r.id]: parseDays(e.target.value) })}
                    />
                    <span className="text-gray-500 w-14">hari</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="bg-panel border border-line rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-line flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-ink">Jatah Khusus per Karyawan</h2>
                <p className="text-[11px] text-gray-400 mt-0.5">Menggantikan jatah jabatan untuk karyawan tertentu.</p>
              </div>
              <div className="sm:w-64 flex-shrink-0">
                <SearchSelect value={pick} options={employees.map((e) => ({ ...e, disabled: used.has(e.id) }))} onChange={addOverride} placeholder="+ Tambah karyawan…" label="Tambah jatah khusus" />
              </div>
            </div>
            <ul className="divide-y divide-line">
              {overrides.map((o) => (
                <li key={o.employeeId} className="px-5 py-2.5 flex items-center justify-between gap-4 text-xs">
                  <span className="min-w-0">
                    <span className="block text-gray-200 truncate">{o.name}</span>
                    <span className="block text-[10px] text-gray-500 font-mono">{o.nik}</span>
                  </span>
                  <span className="flex items-center gap-2 flex-shrink-0">
                    <input
                      inputMode="numeric"
                      aria-label={`Jatah khusus ${o.name}`}
                      className={`${inputCls} w-20 text-right tabular-nums`}
                      value={o.days}
                      onChange={(e) => setOverrides(overrides.map((x) => (x.employeeId === o.employeeId ? { ...x, days: parseDays(e.target.value) ?? 0 } : x)))}
                    />
                    <span className="text-gray-500">hari</span>
                    <button
                      type="button"
                      onClick={() => setOverrides(overrides.filter((x) => x.employeeId !== o.employeeId))}
                      aria-label={`Hapus jatah khusus ${o.name}`}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-rose-400 hover:bg-rose-500/10"
                    >
                      <Icon name="delete" className="text-[17px]" />
                    </button>
                  </span>
                </li>
              ))}
              {overrides.length === 0 && <li className="px-5 py-8 text-center text-xs text-gray-400">Belum ada jatah khusus.</li>}
            </ul>
          </section>
        </div>
      </div>
      <ApplyBar count={changeCount} saving={saving} onReset={reset} onApply={apply} idleText="Pengaturan jatah libur tersimpan" />
      <Toast toast={toast} />
    </>
  );
}
