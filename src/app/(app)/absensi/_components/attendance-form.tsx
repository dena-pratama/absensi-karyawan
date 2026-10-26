"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { openDatePicker } from "@/components/date-input";
import { Toast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { confirmDialog } from "@/components/confirm-dialog";
import { saveAttendance, type AttendanceChange } from "@/lib/actions/attendance";
import { initials, shiftDay } from "@/lib/format";
import type { DayBackup } from "@/lib/data/backup";
import type { CheckDetail } from "@/lib/data/check";
import type { AttendanceStatus } from "@/lib/labels";
import { CheckPhotoCell, CheckTimeCell, PhotoViewer, type PhotoView } from "./check-cells";

export type FormRow = {
  employeeId: string;
  nik: string;
  name: string;
  roleId: string;
  roleName: string;
  status: AttendanceStatus | null;
  note: string;
  /** Check in / out dari app mobile (null = belum ada). */
  check: CheckDetail | null;
  /** Backup hari itu: in = dari cabang lain, out = sedang di cabang lain (baris hanya-lihat). */
  backup: DayBackup | null;
};

type Entry = { status: AttendanceStatus | null; note: string };

const COLUMNS: { status: AttendanceStatus; label: string; head: string; hover: string; accent: string }[] = [
  { status: "hadir", label: "Hadir", head: "text-emerald-400", hover: "hover:bg-emerald-500/10", accent: "accent-emerald-500" },
  { status: "sakit", label: "Sakit", head: "text-amber-400", hover: "hover:bg-amber-500/10", accent: "accent-amber-500" },
  { status: "tidak_hadir", label: "Tidak Hadir", head: "text-rose-400", hover: "hover:bg-rose-500/10", accent: "accent-rose-500" },
];

const ROW_TINT: Record<string, string> = {
  sakit: "bg-amber-950/10",
  tidak_hadir: "bg-rose-950/10",
};

const AVATAR_RING: Record<string, string> = {
  sakit: "ring-amber-500/30 bg-amber-900/40 text-amber-200",
  tidak_hadir: "ring-rose-500/30 bg-rose-900/40 text-rose-200",
  default: "ring-cyan-500/20 bg-cyan-900/40 text-cyan-200",
};

const control =
  "bg-panel border border-line rounded-lg text-xs text-gray-200 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all";

/** Label lokasi hari itu (lihat DayBackup di lib/data/backup.ts). */
const BADGE: Record<DayBackup["kind"], (code: string) => string> = {
  in: (c) => `Backup dari ${c}`,
  out: (c) => `Sedang backup di ${c}`,
  visit: (c) => `Absen di sini · dari ${c}`,
  elsewhere: (c) => `Absen di ${c}`,
};

/** Karyawan cabang ini yang hari itu diabsen di cabang lain → baris hanya-lihat. */
const isAway = (r: FormRow) => r.backup?.kind === "out" || r.backup?.kind === "elsewhere";

function toMap(rows: FormRow[]): Record<string, Entry> {
  return Object.fromEntries(rows.map((r) => [r.employeeId, { status: r.status, note: r.note }]));
}

export function AttendanceForm({
  branchId,
  branchCode,
  date,
  today,
  rows,
  roles,
  lastUpdate,
  readOnly = false,
}: {
  branchId: string;
  branchCode: string;
  date: string;
  today: string;
  rows: FormRow[];
  roles: { id: string; name: string }[];
  lastUpdate: string | null;
  /** Akun SPV / karyawan: hanya melihat, tanpa ceklis & simpan. */
  readOnly?: boolean;
}) {
  const router = useRouter();
  const initial = useMemo(() => toMap(rows), [rows]);
  const [entries, setEntries] = useState(initial);
  const [query, setQuery] = useState("");
  const [roleId, setRoleId] = useState("");
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const [saving, startSaving] = useTransition();
  const [navigating, startNavigating] = useTransition();
  const dateRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<PhotoView | null>(null);
  const closePhoto = useCallback(() => setPhoto(null), []);
  const openPhoto = (r: FormRow, kind: PhotoView["kind"]) => {
    const point = r.check?.[kind];
    if (point) setPhoto({ name: r.name, nik: r.nik, kind, point });
  };

  const openPicker = () => openDatePicker(dateRef.current);

  // Data baru dari server (ganti tanggal / setelah simpan) → reset form.
  const [prevInitial, setPrevInitial] = useState(initial);
  if (prevInitial !== initial) {
    setPrevInitial(initial);
    setEntries(initial);
  }

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const changes: AttendanceChange[] = rows.flatMap((r) => {
    const cur = entries[r.employeeId];
    const init = initial[r.employeeId];
    if (!cur?.status) return [];
    if (cur.status === init.status && cur.note.trim() === init.note.trim()) return [];
    return [{ employeeId: r.employeeId, status: cur.status, note: cur.note }];
  });
  const dirty = changes.length > 0;

  // Peringatkan sebelum menutup tab kalau ada perubahan yang belum disimpan.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const q = query.trim().toLowerCase();
  const visible = rows.filter(
    (r) =>
      (!roleId || r.roleId === roleId) &&
      (!q || r.name.toLowerCase().includes(q) || r.nik.toLowerCase().includes(q) || r.roleName.toLowerCase().includes(q)),
  );

  const counts = Object.values(entries).reduce(
    (acc, e) => {
      if (e.status) acc[e.status] += 1;
      else acc.belum += 1;
      return acc;
    },
    { hadir: 0, sakit: 0, tidak_hadir: 0, belum: 0 },
  );

  const setEntry = (id: string, patch: Partial<Entry>) =>
    setEntries((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const changeDate = async (value: string) => {
    if (!value || value === date) return;
    if (dirty && !(await confirmDialog({ title: "Buang perubahan?", message: "Perubahan absensi belum disimpan. Pindah tanggal dan buang perubahan?", confirmLabel: "Pindah tanggal", tone: "warning" }))) return;
    startNavigating(() => router.push(`/absensi?tanggal=${value}`));
  };

  const markAllPresent = () =>
    setEntries((prev) => {
      const next = { ...prev };
      for (const r of visible) {
        if (isAway(r)) continue; // diabsen / dihitung di cabang lain
        next[r.employeeId] = { ...next[r.employeeId], status: "hadir" };
      }
      return next;
    });

  const submit = () =>
    startSaving(async () => {
      const res = await saveAttendance(branchId, date, changes);
      if (res.ok) {
        setToast({ text: `${res.saved} data absensi tersimpan.`, error: false });
        router.refresh();
      } else {
        setToast({ text: res.error, error: true });
      }
    });

  const isFuture = date > today;

  return (
    <section aria-label="Ceklis harian" className="flex flex-col gap-4">
      {/* Ringkasan */}
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xs font-semibold text-gray-200 uppercase tracking-wider">Ceklis Harian</h2>
        <span className="text-gray-600">|</span>
        <div className="flex flex-wrap items-center gap-2 text-xs tabular-nums">
          <span className="px-2 py-0.5 rounded bg-panel text-gray-300 border border-line">
            Total: <strong className="text-ink">{rows.length}</strong>
          </span>
          <span className="px-2 py-0.5 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-800/30">
            Hadir: <strong className="text-emerald-300">{counts.hadir}</strong>
          </span>
          <span className="px-2 py-0.5 rounded bg-amber-950/40 text-amber-400 border border-amber-800/30">
            Sakit: <strong className="text-amber-300">{counts.sakit}</strong>
          </span>
          <span className="px-2 py-0.5 rounded bg-rose-950/40 text-rose-400 border border-rose-800/30">
            Tidak Hadir: <strong className="text-rose-300">{counts.tidak_hadir}</strong>
          </span>
          {counts.belum > 0 && (
            <span className="px-2 py-0.5 rounded bg-panel text-gray-400 border border-line">
              Belum diisi: <strong className="text-gray-200">{counts.belum}</strong>
            </span>
          )}
        </div>
      </div>

      {/* Filter */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 max-w-sm">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
            <Icon name="search" className="text-[16px]" />
          </div>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Cari karyawan"
            placeholder="Cari karyawan (nama, NIK, role)..."
            className={`${control} w-full pl-9 pr-3 py-1.5 placeholder-gray-500`}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">
            <span className="text-gray-400 shrink-0">Filter Role:</span>
            <span className="relative">
              <select
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                className={`${control} appearance-none text-gray-300 py-1.5 pl-3 pr-8 cursor-pointer`}
              >
                <option value="">Semua Role</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <Icon name="expand_more" className="absolute right-2 top-1/2 -translate-y-1/2 text-[16px] text-gray-400 pointer-events-none" />
            </span>
          </label>
          <div className="flex items-center gap-2">
            <label htmlFor="tanggal-absensi" className="text-gray-400 shrink-0">
              Tanggal:
            </label>
            <div className={`${control} flex items-center p-0.5 ${navigating ? "opacity-60" : ""}`}>
              <button
                type="button"
                onClick={() => changeDate(shiftDay(date, -1))}
                disabled={navigating}
                aria-label="Hari sebelumnya"
                className="p-1 rounded-md text-gray-400 hover:text-ink hover:bg-panel-raised transition-colors"
              >
                <Icon name="chevron_left" className="text-[18px]" />
              </button>
              {/* Ikon kalender bawaan disembunyikan; klik di mana pun pada field membuka picker. */}
              <input
                ref={dateRef}
                id="tanggal-absensi"
                type="date"
                value={date}
                max={today}
                disabled={navigating}
                onClick={openPicker}
                onChange={(e) => changeDate(e.target.value)}
                className="bg-transparent px-1.5 py-1 font-medium text-brand-ink cursor-pointer focus:outline-none [color-scheme:dark] light:[color-scheme:light] [&::-webkit-calendar-picker-indicator]:hidden"
              />
              <button
                type="button"
                onClick={openPicker}
                disabled={navigating}
                aria-label="Pilih tanggal dari kalender"
                className="p-1 rounded-md text-gray-400 hover:text-brand-ink hover:bg-panel-raised transition-colors"
              >
                <Icon name="calendar_month" className="text-[18px]" />
              </button>
              <button
                type="button"
                onClick={() => changeDate(shiftDay(date, 1))}
                disabled={navigating || date >= today}
                aria-label="Hari berikutnya"
                className="p-1 rounded-md text-gray-400 hover:text-ink hover:bg-panel-raised transition-colors disabled:opacity-30 disabled:pointer-events-none"
              >
                <Icon name="chevron_right" className="text-[18px]" />
              </button>
            </div>
            {date !== today && (
              <button
                type="button"
                onClick={() => changeDate(today)}
                disabled={navigating}
                className="px-2.5 py-1.5 rounded-lg border border-line text-gray-300 hover:text-brand-ink hover:border-cyan-500/50 transition-colors"
              >
                Hari ini
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabel */}
      <div className={`overflow-x-auto rounded-xl border border-line bg-shell/60 ${navigating ? "opacity-60" : ""}`}>
        <table className="w-full text-left text-xs border-collapse min-w-[1080px]">
          <thead>
            <tr className="text-gray-400 bg-panel border-b border-line">
              <th scope="col" className="py-3 px-3 font-medium text-center w-12">No</th>
              <th scope="col" className="py-3 px-4 font-medium w-28">NIK / ID</th>
              <th scope="col" className="py-3 px-4 font-medium min-w-[200px]">Nama Karyawan</th>
              {COLUMNS.map((c) => (
                <th key={c.status} scope="col" className={`py-3 px-4 text-center font-medium w-24 ${c.head}`}>
                  {c.label}
                </th>
              ))}
              <th scope="col" className="py-3 px-3 font-medium w-20">In</th>
              <th scope="col" className="py-3 px-3 font-medium w-20">Out</th>
              <th scope="col" className="py-3 px-3 font-medium w-16 text-center">Foto In</th>
              <th scope="col" className="py-3 px-3 font-medium w-16 text-center">Foto Out</th>
              <th scope="col" className="py-3 px-4 font-medium w-56">Keterangan Singkat</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line text-gray-300">
            {visible.map((r, i) => {
              const e = entries[r.employeeId];
              const tone = e.status ?? "default";
              const locked = isFuture || readOnly || isAway(r);
              return (
                <tr key={r.employeeId} className={`hover:bg-panel/60 transition-colors group ${ROW_TINT[e.status ?? ""] ?? ""}`}>
                  <td className="py-3 px-3 text-center font-mono text-gray-500 group-hover:text-ink">{i + 1}</td>
                  <td className="py-3 px-4 font-mono text-gray-400 group-hover:text-ink">{r.nik}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`w-7 h-7 rounded-full ring-1 font-bold flex items-center justify-center text-[10px] flex-shrink-0 ${
                          AVATAR_RING[tone] ?? AVATAR_RING.default
                        }`}
                      >
                        {initials(r.name)}
                      </span>
                      <div className="flex flex-col min-w-0">
                        <span className="font-medium text-ink truncate">{r.name}</span>
                        <span className="text-[10px] text-cyan-400 font-normal truncate">{r.roleName}</span>
                        {r.backup && (
                          <span
                            className={`mt-0.5 self-start text-[9px] font-semibold px-1.5 py-px rounded ${
                              isAway(r) ? "bg-panel-raised text-gray-400" : "bg-purple-500/15 text-purple-300"
                            }`}
                            title={isAway(r) ? "Absensi hari ini dicatat & dihitung di cabang lain" : undefined}
                          >
                            {BADGE[r.backup.kind](r.backup.branchCode)}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  {COLUMNS.map((c) => (
                    <td key={c.status} className="py-3 px-4 text-center">
                      <label className={`inline-flex items-center justify-center cursor-pointer p-1 rounded transition-colors ${c.hover}`}>
                        <span className="sr-only">
                          {r.name}: {c.label}
                        </span>
                        <input
                          type="radio"
                          name={`absen_${r.employeeId}`}
                          value={c.status}
                          checked={e.status === c.status}
                          disabled={locked}
                          onChange={() => setEntry(r.employeeId, { status: c.status })}
                          className={`w-4 h-4 cursor-pointer ${c.accent}`}
                        />
                      </label>
                    </td>
                  ))}
                  <td className="py-3 px-3">
                    <CheckTimeCell point={r.check?.in ?? null} />
                  </td>
                  <td className="py-3 px-3">
                    <CheckTimeCell point={r.check?.out ?? null} />
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex justify-center">
                      <CheckPhotoCell point={r.check?.in ?? null} label={`check in ${r.name}`} onOpen={() => openPhoto(r, "in")} />
                    </div>
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex justify-center">
                      <CheckPhotoCell point={r.check?.out ?? null} label={`check out ${r.name}`} onOpen={() => openPhoto(r, "out")} />
                    </div>
                  </td>
                  <td className="py-2 px-4">
                    <input
                      type="text"
                      value={e.note}
                      maxLength={200}
                      disabled={locked}
                      onChange={(ev) => setEntry(r.employeeId, { note: ev.target.value })}
                      aria-label={`Keterangan ${r.name}`}
                      placeholder="-"
                      className="w-full bg-transparent border border-transparent hover:border-line focus:border-brand rounded-md px-2 py-1 text-xs text-gray-300 placeholder-gray-600 focus:outline-none transition-colors"
                    />
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={11} className="py-10 text-center text-gray-400">
                  {rows.length === 0 ? (
                    <>
                      Belum ada karyawan yang ditempatkan di cabang ini pada tanggal tersebut.
                      {date < today && (
                        <span className="block mt-1 text-[11px] text-gray-500">
                          Karyawan tampil mulai Tanggal Bergabung-nya. Atur di Pengaturan → Manajemen Karyawan.
                        </span>
                      )}
                    </>
                  ) : (
                    "Tidak ada karyawan yang cocok dengan filter."
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Aksi */}
      <div className="pt-3 border-t border-line flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-gray-400">
          <span className={`w-2 h-2 rounded-full ${dirty ? "bg-amber-400" : "bg-emerald-400"}`} />
          {dirty
            ? `${changes.length} perubahan belum disimpan`
            : lastUpdate
              ? `Tersimpan untuk ${branchCode} • terakhir update ${lastUpdate}`
              : `Belum ada absensi tersimpan untuk ${branchCode} di tanggal ini`}
        </div>
        {readOnly ? (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line bg-panel text-gray-400">
            <Icon name="visibility" className="text-[16px]" />
            Mode lihat saja. Absensi diisi lewat aplikasi mobile atau oleh admin.
          </span>
        ) : (
        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={() => setEntries(initial)}
            className="px-3 py-1.5 rounded-lg border border-line bg-panel text-gray-400 hover:text-ink hover:border-gray-500 transition-colors disabled:opacity-50 disabled:pointer-events-none"
          >
            Batal / Reset
          </button>
          <button
            type="button"
            disabled={saving || isFuture || visible.length === 0}
            onClick={markAllPresent}
            className="px-3.5 py-1.5 rounded-lg border border-line-strong bg-panel-raised text-gray-200 hover:text-brand-ink hover:border-brand/40 transition-colors disabled:opacity-50 disabled:pointer-events-none"
          >
            Tandai Semua Hadir
          </button>
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={submit}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-brand hover:bg-brand/90 text-black font-semibold shadow-[0_0_15px_rgba(0,210,255,0.25)] transition-all disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed"
          >
            {saving ? (
              <span className="w-3.5 h-3.5 rounded-full border-2 border-black border-t-transparent animate-spin" />
            ) : (
              <Icon name="check" className="text-[16px]" />
            )}
            Update Absen
          </button>
        </div>
        )}
      </div>

      <PhotoViewer view={photo} onClose={closePhoto} />

      <Toast toast={toast} duration={3200} />
    </section>
  );
}
