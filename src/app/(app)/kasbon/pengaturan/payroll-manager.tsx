"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { savePayrollSettings } from "@/lib/actions/kasbon";
import type { PayrollSettings } from "@/lib/data/kasbon";
import { formatRupiah } from "@/lib/format";
import { ApplyBar, Field, SelectBox, Toast, filterCls, inputCls, useToastTimer } from "../../pengaturan/_components/ui";
import { SearchSelect } from "../../pengaturan/_components/search-select";

type Option = { id: string; label: string };
type Override = { employeeId: string; name: string; nik: string; salary: number };

const parseAmount = (v: string) => (v.replace(/\D/g, "") === "" ? null : Number(v.replace(/\D/g, "")));
const groupDigits = (n: number | null) => (n === null ? "" : new Intl.NumberFormat("id-ID").format(n));

/** Contoh periode dari tanggal cut-off (hanya tampilan; periode resmi dihitung payroll_period() di database). */
function examplePeriod(cutoff: number) {
  if (cutoff === 31) return "tanggal 1 s/d akhir bulan (bulan kalender)";
  return `tanggal ${cutoff + 1} bulan lalu s/d tanggal ${cutoff} bulan ini`;
}

export function PayrollManager({ settings, employees }: { settings: { ready: false } | ({ ready: true } & PayrollSettings); employees: Option[] }) {
  if (!settings.ready) {
    return (
      <div role="alert" className="rounded-2xl border border-amber-500/40 bg-amber-950/30 p-4 text-xs text-amber-200 flex gap-3">
        <Icon name="warning" className="text-[20px] text-amber-400 flex-shrink-0" />
        <p>
          Fitur kasbon belum aktif. Jalankan <code className="font-mono">supabase/migrations/20261025000000_kasbon.sql</code> di SQL Editor Supabase,
          lalu muat ulang halaman.
        </p>
      </div>
    );
  }
  return <PayrollForm initial={settings} employees={employees} />;
}

function PayrollForm({ initial, employees }: { initial: PayrollSettings; employees: Option[] }) {
  const router = useRouter();
  const [divisor, setDivisor] = useState(initial.dailyDivisor);
  const [cutoff, setCutoff] = useState(initial.cutoffDay);
  const [roleSalary, setRoleSalary] = useState<Record<string, number | null>>(() => Object.fromEntries(initial.roles.map((r) => [r.id, r.salary])));
  const [overrides, setOverrides] = useState<Override[]>(initial.overrides);
  const [pick, setPick] = useState("");
  const [roleQuery, setRoleQuery] = useState("");
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const [saving, startSaving] = useTransition();
  const clearToast = useCallback(() => setToast(null), []);
  useToastTimer(toast, clearToast);

  const initialOverride = useMemo(() => new Map(initial.overrides.map((o) => [o.employeeId, o.salary])), [initial.overrides]);
  const roleChanges = initial.roles
    .filter((r) => (roleSalary[r.id] ?? null) !== r.salary)
    .map((r) => ({ id: r.id, salary: roleSalary[r.id] ?? null }));
  const overrideChanges = [
    ...overrides
      .filter((o) => initialOverride.get(o.employeeId) !== o.salary)
      .map((o) => ({ employeeId: o.employeeId, salary: o.salary as number | null })),
    ...initial.overrides
      .filter((o) => !overrides.some((x) => x.employeeId === o.employeeId))
      .map((o) => ({ employeeId: o.employeeId, salary: null })),
  ];
  const changeCount = Number(divisor !== initial.dailyDivisor) + Number(cutoff !== initial.cutoffDay) + roleChanges.length + overrideChanges.length;

  const reset = () => {
    setDivisor(initial.dailyDivisor);
    setCutoff(initial.cutoffDay);
    setRoleSalary(Object.fromEntries(initial.roles.map((r) => [r.id, r.salary])));
    setOverrides(initial.overrides);
  };

  const apply = () =>
    startSaving(async () => {
      const res = await savePayrollSettings({ dailyDivisor: divisor, cutoffDay: cutoff, roles: roleChanges, overrides: overrideChanges });
      setToast(res.ok ? { text: "Pengaturan kasbon disimpan.", error: false } : { text: res.error, error: true });
      if (res.ok) router.refresh();
    });

  const addOverride = (id: string) => {
    const e = employees.find((x) => x.id === id);
    if (!e || overrides.some((o) => o.employeeId === id)) return;
    const nik = e.label.match(/\(([^)]+)\)$/)?.[1] ?? "-";
    setOverrides([{ employeeId: id, name: e.label.replace(/\s*\([^)]+\)$/, ""), nik, salary: 0 }, ...overrides]);
    setPick("");
  };

  const sampleSalary = Object.values(roleSalary).find((v): v is number => !!v) ?? 2_000_000;
  const rq = roleQuery.trim().toLowerCase();
  const shownRoles = initial.roles.filter((r) => !rq || r.name.toLowerCase().includes(rq));
  const usedIds = new Set(overrides.map((o) => o.employeeId));

  return (
    <>
      {/* Desktop: daftar gaji di kiri, aturan plafon di kanan (posisi tetap, tidak ikut scroll). Mobile: aturan tetap paling atas. */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] gap-6 items-start">
        <section aria-labelledby="rule-title" className="bg-panel border border-line rounded-2xl p-5 flex flex-col gap-4 lg:order-2">
          <div>
            <h2 id="rule-title" className="text-sm font-bold text-ink flex items-center gap-2">
              <Icon name="calculate" className="text-[18px] text-brand-ink" />
              Aturan Plafon
            </h2>
            <p className="text-[11px] text-gray-400 mt-0.5">Plafon = gaji pokok ÷ pembagi × hari Hadir (HK) pada periode gajian berjalan.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3.5">
            <Field label="Pembagi harian" hint="Mis. 25 atau 26 hari kerja per bulan.">
              <input
                type="number"
                min={1}
                max={31}
                className={inputCls}
                value={divisor}
                onChange={(e) => setDivisor(Math.max(1, Math.min(31, Math.trunc(Number(e.target.value) || 1))))}
              />
            </Field>
            <Field label="Tanggal cut-off gajian" hint={`Periode: ${examplePeriod(cutoff)}.`}>
              <SelectBox value={cutoff} onChange={(e) => setCutoff(Number(e.target.value))}>
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    Tanggal {d}
                  </option>
                ))}
                <option value={31}>Akhir bulan</option>
              </SelectBox>
            </Field>
          </div>
          <p className="text-[11px] text-gray-400 font-mono bg-panel-inset border border-line rounded-lg px-3 py-2">
            Contoh: {formatRupiah(sampleSalary)} ÷ {divisor} × 10 HK = {formatRupiah(Math.floor((sampleSalary * 10) / divisor))}
          </p>
        </section>

        <div className="flex flex-col gap-6 min-w-0">
          <section aria-labelledby="role-salary-title" className="bg-panel border border-line rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-line flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <div>
                <h2 id="role-salary-title" className="text-sm font-bold text-ink">
                  Gaji Pokok per Jabatan
                </h2>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Kosongkan bila jabatan itu tidak bisa kasbon. Berlaku untuk semua karyawan di jabatan tersebut.
                </p>
              </div>
              {initial.roles.length > 6 && (
                <input
                  value={roleQuery}
                  onChange={(e) => setRoleQuery(e.target.value)}
                  placeholder="Cari jabatan..."
                  aria-label="Cari jabatan"
                  className={`${filterCls} px-3 py-2 sm:w-56 placeholder-gray-500`}
                />
              )}
            </div>
            <ul className="divide-y divide-line">
              {shownRoles.map((r) => {
                const v = roleSalary[r.id] ?? null;
                return (
                  <li key={r.id} className="px-5 py-2.5 flex items-center justify-between gap-4 text-xs">
                    <span className="text-gray-200 flex items-center gap-2 min-w-0">
                      <span className="truncate">{r.name}</span>
                      {v !== r.salary && (
                        <span className="text-[9px] px-1.5 py-px rounded border bg-amber-500/10 text-amber-300 border-amber-500/30">Diubah</span>
                      )}
                    </span>
                    <span className="relative w-44 flex-shrink-0">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">Rp</span>
                      <input
                        inputMode="numeric"
                        aria-label={`Gaji pokok ${r.name}`}
                        className={`${inputCls} pl-9 text-right tabular-nums`}
                        value={groupDigits(v)}
                        placeholder="belum diatur"
                        onChange={(e) => setRoleSalary({ ...roleSalary, [r.id]: parseAmount(e.target.value) })}
                      />
                    </span>
                  </li>
                );
              })}
              {shownRoles.length === 0 && <li className="px-5 py-8 text-center text-xs text-gray-400">Tidak ada jabatan aktif.</li>}
            </ul>
          </section>

          <section aria-labelledby="override-title" className="bg-panel border border-line rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-line flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <div>
                <h2 id="override-title" className="text-sm font-bold text-ink flex items-center gap-2">
                  Gaji Khusus per Karyawan
                  <span className="text-[11px] font-mono font-normal text-cyan-300">{overrides.length} Karyawan</span>
                </h2>
                <p className="text-[11px] text-gray-400 mt-0.5">Menggantikan gaji jabatan untuk karyawan tertentu.</p>
              </div>
              <div className="sm:w-64 flex-shrink-0">
                <SearchSelect
                  value={pick}
                  options={employees.map((e) => ({ ...e, disabled: usedIds.has(e.id) }))}
                  onChange={addOverride}
                  placeholder="+ Tambah karyawan…"
                  label="Tambah gaji khusus karyawan"
                />
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
                    <span className="relative w-44">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">Rp</span>
                      <input
                        inputMode="numeric"
                        aria-label={`Gaji khusus ${o.name}`}
                        className={`${inputCls} pl-9 text-right tabular-nums`}
                        value={groupDigits(o.salary)}
                        onChange={(e) =>
                          setOverrides(overrides.map((x) => (x.employeeId === o.employeeId ? { ...x, salary: parseAmount(e.target.value) ?? 0 } : x)))
                        }
                      />
                    </span>
                    <button
                      type="button"
                      onClick={() => setOverrides(overrides.filter((x) => x.employeeId !== o.employeeId))}
                      aria-label={`Hapus gaji khusus ${o.name}`}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-rose-400 hover:bg-rose-500/10"
                    >
                      <Icon name="delete" className="text-[17px]" />
                    </button>
                  </span>
                </li>
              ))}
              {overrides.length === 0 && (
                <li className="px-5 py-8 text-center text-xs text-gray-400">Belum ada gaji khusus. Semua karyawan memakai gaji jabatan.</li>
              )}
            </ul>
          </section>
        </div>
      </div>

      <ApplyBar count={changeCount} saving={saving} onReset={reset} onApply={apply} idleText="Pengaturan kasbon tersimpan" />
      <Toast toast={toast} />
    </>
  );
}
