import type { AttendanceStatus } from "@/lib/labels";

/** Usulan perubahan absensi dari AI — baru dijalankan setelah admin menyetujui. */
export type AttendanceProposal = {
  id: string;
  branchId: string;
  branchCode: string;
  date: string;
  changes: {
    employeeId: string;
    nik: string;
    name: string;
    status: AttendanceStatus;
    note: string;
    prevStatus: AttendanceStatus | null;
  }[];
  expiresAt: number; // epoch ms
};

/** Proposal + token bertanda tangan (HMAC) yang dikirim ke client. */
export type SignedProposal = { proposal: AttendanceProposal; token: string };

export const PROPOSAL_TTL_MS = 30 * 60 * 1000;
