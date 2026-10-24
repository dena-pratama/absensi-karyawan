"use client";

import { useEffect, useMemo, useState } from "react";

/** Penanda global "ada perubahan belum diterapkan" (dipakai tab untuk konfirmasi pindah halaman). */
export const unsavedStore = { dirty: false };

/**
 * State "simpan sekaligus": baris diubah/ditambah di client dulu,
 * baru dikirim ke server saat "Terapkan Pengaturan".
 */
export function useStaged<T extends { id: string }>(initial: T[]) {
  const [rows, setRows] = useState(initial);
  const [prevInitial, setPrevInitial] = useState(initial);
  if (prevInitial !== initial) {
    // Data baru dari server (setelah simpan) → mulai ulang.
    setPrevInitial(initial);
    setRows(initial);
  }

  const initialById = useMemo(() => new Map(initial.map((r) => [r.id, JSON.stringify(r)])), [initial]);
  const changes = rows.filter((r) => initialById.get(r.id) !== JSON.stringify(r));
  const dirty = changes.length > 0;

  useEffect(() => {
    unsavedStore.dirty = dirty;
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      unsavedStore.dirty = false;
    };
  }, [dirty]);

  return {
    rows,
    changes,
    dirty,
    isChanged: (id: string) => initialById.get(id) !== JSON.stringify(rows.find((r) => r.id === id)),
    isNew: (id: string) => !initialById.has(id),
    upsert: (row: T) =>
      setRows((prev) => (prev.some((r) => r.id === row.id) ? prev.map((r) => (r.id === row.id ? row : r)) : [row, ...prev])),
    patch: (id: string, p: Partial<T>) => setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...p } : r))),
    /** Buang baris dari daftar (dipakai untuk baris baru yang belum diterapkan). */
    remove: (id: string) => setRows((prev) => prev.filter((r) => r.id !== id)),
    reset: () => setRows(initial),
  };
}

let seq = 0;
export const newId = () => `new-${Date.now()}-${seq++}`;
