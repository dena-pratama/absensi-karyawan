import { Suspense } from "react";
import { getShellData } from "@/lib/data/shell";

async function BranchCode() {
  const { activeBranch } = await getShellData();
  return activeBranch?.code ?? null;
}

/** Crumb kode cabang aktif; kosong (crumb disembunyikan) bila belum ada cabang. */
export function BranchCrumb() {
  return (
    <Suspense fallback="…">
      <BranchCode />
    </Suspense>
  );
}
