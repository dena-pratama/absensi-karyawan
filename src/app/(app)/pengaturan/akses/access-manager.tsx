"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { createUserAccount, saveUserAccess, type NewAccount } from "@/lib/actions/access";
import type { UserAccess } from "@/lib/data/access";
import { APP_ROLE_LABEL, type AppRole } from "@/lib/labels";
import { PASSWORD_MIN, USERNAME_HINT, usernameFromNik } from "@/lib/login-id";
import { ApplyBar, ChangeBadge, Field, Modal, Pagination, SelectBox, Toast, filterCls, inputCls, useToastTimer } from "../_components/ui";
import { useStaged } from "../_components/staged";
import { BranchMultiPicker } from "./branch-multi-picker";

type UserRow = UserAccess & { createdLabel: string | null; lastSignInLabel: string | null };
type Draft = { id: string; role: AppRole | ""; branchIds: string[]; employeeId: string };
type Option = { id: string; label: string };
type RoleFilter = "" | AppRole | "none";

const PAGE_SIZE = 10;
const EMPTY_ACCOUNT: NewAccount = { login: "", password: "", role: "karyawan", branchIds: [], employeeId: "" };

const ROLE_STYLE: Record<AppRole | "", string> = {
  admin: "bg-cyan-500/10 text-cyan-300 border-cyan-500/30",
  spv: "bg-purple-500/10 text-purple-300 border-purple-500/30",
  karyawan: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  "": "bg-panel-raised text-gray-400 border-line-strong",
};

/** Ringkasan hak akses per role — mengikuti policy di migrasi role_based_rls. */
const MATRIX: { area: string; admin: string; spv: string; karyawan: string }[] = [
  { area: "Panel web: Dashboard & Absensi", admin: "Lihat & ubah", spv: "Lihat saja, cabang-cabangnya", karyawan: "Lihat saja, dirinya" },
  { area: "Panel web: Laporan & Pengaturan", admin: "Penuh", spv: "-", karyawan: "-" },
  { area: "Data karyawan & penempatan", admin: "Baca & ubah", spv: "Baca, cabang-cabangnya", karyawan: "Baca, dirinya" },
  { area: "Data cabang", admin: "Baca & ubah", spv: "Baca, cabang-cabangnya", karyawan: "Baca, cabang-cabangnya" },
  { area: "Absensi harian (app mobile)", admin: "Baca & ubah", spv: "Isi/ubah cabang-cabangnya (s/d hari ini)", karyawan: "Isi/ubah miliknya, hari ini" },
  { area: "Penugasan backup karyawan", admin: "Buat & ubah (web)", spv: "Buat & ubah (app), cabang-cabangnya", karyawan: "Lihat miliknya" },
  { area: "Master jabatan & cluster", admin: "Baca & ubah", spv: "Baca", karyawan: "Baca" },
  { area: "Log perubahan, konektor AI, hak akses", admin: "Penuh", spv: "-", karyawan: "-" },
];

export function AccessManager({
  rlsReady,
  adminApiReady,
  myUserId,
  users,
  branches,
  employees,
}: {
  rlsReady: boolean;
  /** SUPABASE_SECRET_KEY diatur di server → bisa membuat akun dari sini. */
  adminApiReady: boolean;
  myUserId: string;
  users: UserRow[];
  branches: Option[];
  employees: Option[];
}) {
  const router = useRouter();
  const initial = useMemo<Draft[]>(
    () => users.map((u) => ({ id: u.userId, role: u.role ?? "", branchIds: u.branchIds, employeeId: u.employeeId })),
    [users],
  );
  const staged = useStaged(initial);
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const [saving, startSaving] = useTransition();
  const clearToast = useCallback(() => setToast(null), []);
  useToastTimer(toast, clearToast);

  const userById = new Map(users.map((u) => [u.userId, u]));
  const counts = staged.rows.reduce<Record<AppRole | "", number>>(
    (acc, r) => ((acc[r.role] += 1), acc),
    { admin: 0, spv: 0, karyawan: 0, "": 0 },
  );
  // Satu data karyawan hanya boleh terhubung ke satu akun.
  const takenEmployee = new Map(staged.rows.filter((r) => r.role === "karyawan" && r.employeeId).map((r) => [r.employeeId, r.id]));

  // Filter & halaman tabel akun
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("");
  const [page, setPage] = useState(1);
  const q = query.trim().toLowerCase();
  const filtered = staged.rows.filter(
    (r) =>
      (!q || (userById.get(r.id)?.email ?? "").toLowerCase().includes(q)) &&
      (!roleFilter || (roleFilter === "none" ? r.role === "" : r.role === roleFilter)),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  // Tambah akun (langsung dibuat, bukan draf)
  const [account, setAccount] = useState<NewAccount | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [creating, startCreating] = useTransition();
  const closeAccount = () => setAccount(null);
  const openAccount = () => {
    setFormError(null);
    setShowPassword(false);
    setAccount(EMPTY_ACCOUNT);
  };
  const createAccount = () =>
    startCreating(async () => {
      if (!account) return;
      const res = await createUserAccount(account);
      if (!res.ok) return setFormError(res.error);
      setAccount(null);
      setToast({ text: `Akun ${res.login} berhasil dibuat.`, error: false });
      router.refresh();
    });

  // Cakupan yang tidak relevan untuk role baru dikosongkan (SPV → cabang, karyawan → data karyawan).
  const changeRole = (id: string, role: AppRole | "") => {
    const cur = staged.rows.find((r) => r.id === id);
    staged.patch(id, {
      role,
      branchIds: role === "spv" ? (cur?.branchIds ?? []) : [],
      employeeId: role === "karyawan" ? (cur?.employeeId ?? "") : "",
    });
  };

  const apply = () =>
    startSaving(async () => {
      const invalid = staged.changes.find((c) => (c.role === "spv" && !c.branchIds.length) || (c.role === "karyawan" && !c.employeeId));
      if (invalid) {
        setToast({ text: `${userById.get(invalid.id)?.email}: lengkapi ${invalid.role === "spv" ? "cabang" : "data karyawan"}.`, error: true });
        return;
      }
      const res = await saveUserAccess(staged.changes.map((c) => ({ userId: c.id, role: c.role, branchIds: c.branchIds, employeeId: c.employeeId })));
      setToast(
        res.ok
          ? { text: `${res.applied} perubahan hak akses diterapkan.`, error: false }
          : { text: res.applied ? `${res.error} (${res.applied} perubahan lain sudah tersimpan)` : res.error, error: true },
      );
      router.refresh();
    });

  if (!rlsReady) {
    return (
      <div role="alert" className="rounded-2xl border border-amber-500/40 bg-amber-950/30 p-4 text-xs text-amber-200 flex gap-3">
        <Icon name="warning" className="text-[20px] text-amber-400 flex-shrink-0" />
        <div className="space-y-1">
          <p className="font-semibold">RLS berbasis role belum aktif.</p>
          <p>
            Jalankan <code className="font-mono">supabase/migrations/20261021000000_role_based_rls.sql</code> di SQL Editor Supabase, lalu muat
            ulang halaman. Sampai migrasi dijalankan, setiap akun yang login masih punya akses penuh, jadi jangan buat akun lain dulu.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <section aria-label="Ringkasan role" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {(["admin", "spv", "karyawan", ""] as const).map((r) => (
          <div key={r || "none"} className="bg-panel border border-line rounded-2xl p-4">
            <div className="text-[11px] text-gray-400">{r ? APP_ROLE_LABEL[r] : "Tanpa Akses"}</div>
            <div className="text-2xl font-bold text-ink mt-1 tabular-nums">{counts[r]}</div>
            <div className="text-[10px] text-gray-500 mt-0.5">akun</div>
          </div>
        ))}
      </section>

      <section aria-labelledby="akses-title" className="bg-panel border border-line rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-line flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 id="akses-title" className="text-sm font-bold text-ink flex items-center gap-2">
              Pengguna &amp; Hak Akses
              <span className="text-[11px] font-mono text-cyan-300">{staged.rows.length} Akun</span>
            </h2>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {adminApiReady
                ? "Tambah akun langsung dari sini, atau atur role akun yang sudah ada."
                : "Akun baru dibuat di Supabase → Authentication → Users, lalu diberi role di sini."}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 text-xs">
            <div className="relative sm:w-56">
              <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-gray-500 pointer-events-none" />
              <input
                type="search"
                value={query}
                onChange={(e) => (setQuery(e.target.value), setPage(1))}
                aria-label="Cari username / email"
                placeholder="Cari username / email..."
                className={`${filterCls} w-full pl-9 pr-3 py-2 placeholder-gray-500`}
              />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => (setRoleFilter(e.target.value as RoleFilter), setPage(1))}
              aria-label="Filter role"
              className={`${filterCls} py-2 px-3`}
            >
              <option value="">Semua Role</option>
              <option value="admin">{APP_ROLE_LABEL.admin}</option>
              <option value="spv">{APP_ROLE_LABEL.spv}</option>
              <option value="karyawan">{APP_ROLE_LABEL.karyawan}</option>
              <option value="none">Tanpa Akses</option>
            </select>
            <button
              type="button"
              onClick={openAccount}
              disabled={!adminApiReady || staged.dirty}
              title={
                !adminApiReady
                  ? "Atur SUPABASE_SECRET_KEY di server untuk mengaktifkan"
                  : staged.dirty
                    ? "Terapkan atau reset perubahan role dulu"
                    : undefined
              }
              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-brand hover:bg-brand/90 text-black font-semibold shadow-[0_0_15px_rgba(0,210,255,0.25)] transition disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed"
            >
              <Icon name="person_add" className="text-[16px]" />
              Tambah Akun
            </button>
          </div>
        </div>
        {!adminApiReady && (
          <div className="px-5 py-2.5 border-b border-line bg-amber-950/20 text-[11px] text-amber-200 flex items-center gap-2">
            <Icon name="info" className="text-[16px] text-amber-400 flex-shrink-0" />
            <span>
              Tombol Tambah Akun aktif setelah <code className="font-mono">SUPABASE_SECRET_KEY</code> diisi di <code className="font-mono">.env.local</code> /
              Environment Variables Vercel (Supabase → Project Settings → API Keys → Secret keys), lalu server di-restart / redeploy.
            </span>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse min-w-[760px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-gray-400 border-b border-line">
                <th scope="col" className="py-3 px-5 font-semibold">Akun</th>
                <th scope="col" className="py-3 px-4 font-semibold w-44">Role</th>
                <th scope="col" className="py-3 px-4 font-semibold">Cakupan Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visible.map((r) => {
                const u = userById.get(r.id);
                const isMe = r.id === myUserId;
                return (
                  <tr key={r.id} className="hover:bg-panel-raised/50 transition align-top">
                    <td className="py-3 px-5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-ink truncate">{u?.email}</span>
                        {isMe && <span className="text-[9px] px-1.5 py-px rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">Anda</span>}
                        <ChangeBadge isNew={false} changed={staged.isChanged(r.id)} />
                      </div>
                      <div className="text-[10px] text-gray-500 mt-0.5">
                        Login terakhir: {u?.lastSignInLabel ?? "belum pernah"} · dibuat {u?.createdLabel}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {isMe ? (
                        <span className={`inline-block px-2 py-0.5 rounded-full border text-[11px] font-semibold ${ROLE_STYLE[r.role]}`}>
                          {r.role ? APP_ROLE_LABEL[r.role] : "Tanpa Akses"}
                        </span>
                      ) : (
                        <SelectBox value={r.role} onChange={(e) => changeRole(r.id, e.target.value as AppRole | "")} aria-label={`Role ${u?.email}`}>
                          <option value="">Tanpa Akses</option>
                          <option value="admin">{APP_ROLE_LABEL.admin}</option>
                          <option value="spv">{APP_ROLE_LABEL.spv}</option>
                          <option value="karyawan">{APP_ROLE_LABEL.karyawan}</option>
                        </SelectBox>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {r.role === "admin" && <span className="text-gray-300">Semua data{isMe && " · akun sendiri tidak bisa diubah"}</span>}
                      {r.role === "" && <span className="text-gray-500">Tidak bisa membaca data apa pun</span>}
                      {r.role === "spv" && (
                        <BranchMultiPicker value={r.branchIds} options={branches} onChange={(ids) => staged.patch(r.id, { branchIds: ids })} />
                      )}
                      {r.role === "karyawan" && (
                        <SelectBox value={r.employeeId} onChange={(e) => staged.patch(r.id, { employeeId: e.target.value })} aria-label="Data karyawan">
                          <option value="">Pilih karyawan…</option>
                          {employees.map((e) => (
                            <option key={e.id} value={e.id} disabled={takenEmployee.has(e.id) && takenEmployee.get(e.id) !== r.id}>
                              {e.label}
                            </option>
                          ))}
                        </SelectBox>
                      )}
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-10 text-center text-gray-400">
                    {staged.rows.length === 0 ? "Belum ada akun." : "Tidak ada akun yang cocok dengan filter."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-line flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-400">
            <span>
              Menampilkan {(current - 1) * PAGE_SIZE + 1}–{Math.min(current * PAGE_SIZE, filtered.length)} dari {filtered.length} akun
            </span>
            <Pagination page={current} pages={pages} onPage={setPage} />
          </div>
        )}
      </section>

      <section aria-labelledby="matrix-title" className="bg-panel border border-line rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-line">
          <h2 id="matrix-title" className="text-sm font-bold text-ink flex items-center gap-2">
            <Icon name="shield_lock" className="text-[18px] text-brand-ink" />
            Aturan Akses (Row Level Security)
          </h2>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Dijaga langsung oleh database Supabase, jadi berlaku juga untuk aplikasi mobile. Aturan diubah lewat migrasi SQL.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse min-w-[640px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-gray-400 border-b border-line">
                <th scope="col" className="py-3 px-5 font-semibold">Data / Fitur</th>
                <th scope="col" className="py-3 px-4 font-semibold">{APP_ROLE_LABEL.admin}</th>
                <th scope="col" className="py-3 px-4 font-semibold">{APP_ROLE_LABEL.spv}</th>
                <th scope="col" className="py-3 px-4 font-semibold">{APP_ROLE_LABEL.karyawan}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {MATRIX.map((m) => (
                <tr key={m.area}>
                  <td className="py-2.5 px-5 text-gray-200">{m.area}</td>
                  {[m.admin, m.spv, m.karyawan].map((v, i) => (
                    <td key={i} className={`py-2.5 px-4 ${v === "-" ? "text-gray-600" : "text-gray-300"}`}>
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Modal
        open={account !== null}
        title="Tambah Akun"
        description="Akun langsung aktif. Berikan username & kata sandi awal ke penggunanya."
        onClose={closeAccount}
        onSubmit={createAccount}
        submitLabel={creating ? "Membuat..." : "Buat Akun"}
        error={formError}
      >
        {account && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <Field label="Username / Email" hint={USERNAME_HINT}>
                <input
                  type="text"
                  className={`${inputCls} font-mono`}
                  value={account.login}
                  onChange={(e) => setAccount({ ...account, login: e.target.value })}
                  placeholder="mis. budi01"
                  autoCapitalize="none"
                  spellCheck={false}
                  autoComplete="off"
                  required
                />
              </Field>
              <Field label="Kata Sandi Awal" hint={`Minimal ${PASSWORD_MIN} karakter, bebas huruf / angka / simbol.`}>
                <span className="relative block">
                  <input
                    type={showPassword ? "text" : "password"}
                    className={`${inputCls} pr-9`}
                    value={account.password}
                    onChange={(e) => setAccount({ ...account, password: e.target.value })}
                    autoComplete="new-password"
                    minLength={PASSWORD_MIN}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-brand-ink"
                  >
                    <Icon name={showPassword ? "visibility_off" : "visibility"} className="text-[17px]" />
                  </button>
                </span>
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <Field label="Role">
                <SelectBox
                  value={account.role}
                  onChange={(e) => setAccount({ ...account, role: e.target.value as AppRole, branchIds: [], employeeId: "" })}
                >
                  <option value="karyawan">{APP_ROLE_LABEL.karyawan}</option>
                  <option value="spv">{APP_ROLE_LABEL.spv}</option>
                  <option value="admin">{APP_ROLE_LABEL.admin}</option>
                </SelectBox>
              </Field>
              {account.role === "spv" && (
                <Field label="Cabang yang Dipegang" hint="Boleh lebih dari satu cabang.">
                  <BranchMultiPicker value={account.branchIds} options={branches} onChange={(ids) => setAccount({ ...account, branchIds: ids })} />
                </Field>
              )}
              {account.role === "karyawan" && (
                <Field label="Data Karyawan" hint="Satu data karyawan hanya untuk satu akun.">
                  <SelectBox
                    value={account.employeeId}
                    // Username kosong → isi otomatis dari NIK karyawan yang dipilih.
                    onChange={(e) => {
                      const nik = employees.find((x) => x.id === e.target.value)?.label.match(/(([^)]+))$/)?.[1] ?? "";
                      setAccount({ ...account, employeeId: e.target.value, login: account.login || usernameFromNik(nik) });
                    }}
                    required
                  >
                    <option value="">Pilih karyawan…</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id} disabled={takenEmployee.has(e.id)}>
                        {e.label}
                      </option>
                    ))}
                  </SelectBox>
                </Field>
              )}
              {account.role === "admin" && (
                <p className="text-[11px] text-amber-300 self-end pb-2">Admin punya akses penuh ke semua data & pengaturan.</p>
              )}
            </div>
          </>
        )}
      </Modal>

      <ApplyBar count={staged.changes.length} saving={saving} onReset={staged.reset} onApply={apply} idleText="Semua hak akses tersimpan" />
      <Toast toast={toast} />
    </>
  );
}
