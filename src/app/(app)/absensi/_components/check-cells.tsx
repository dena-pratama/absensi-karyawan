"use client";

import { useEffect } from "react";
import { AnimatePresence, m } from "motion/react";
import { Icon } from "@/components/icon";
import { POP } from "@/components/motion";
import { PopupLayer } from "@/components/popup-overlay";
import type { CheckPoint } from "@/lib/data/check";

export type CheckKind = "in" | "out";
export type PhotoView = { name: string; nik: string; kind: CheckKind; point: CheckPoint };

const KIND_LABEL: Record<CheckKind, string> = { in: "Check In", out: "Check Out" };

const meters = (m: number | null) => (m == null ? "-" : `${Math.round(m)} m`);

/** Sel jam check in / out: "08:15 WIB" + jarak ke titik cabang. */
export function CheckTimeCell({ point }: { point: CheckPoint | null }) {
  if (!point) return <span className="text-gray-600">-</span>;
  return (
    <div className="flex flex-col leading-tight">
      <span className="font-mono font-semibold text-gray-200 whitespace-nowrap">
        {point.time.replace(" WIB", "")}
        {point.wfa && (
          <span className="ml-1 align-middle text-[9px] px-1.5 py-px rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 font-sans" title="Work From Anywhere">
            WFA
          </span>
        )}
      </span>
      <span className="text-[10px] text-gray-500 whitespace-nowrap" title="Jarak ke titik outlet saat absen">
        {point.wfa ? (
          <>{meters(point.distanceM)} dari cabang utama</>
        ) : point.branchCode ? (
          <>
            di <span className="font-semibold text-purple-300">{point.branchCode}</span> · {meters(point.distanceM)}
          </>
        ) : (
          <>{meters(point.distanceM)} dari cabang</>
        )}
      </span>
    </div>
  );
}

/** Sel foto selfie: thumbnail, klik untuk memperbesar. */
export function CheckPhotoCell({
  point,
  label,
  onOpen,
}: {
  point: CheckPoint | null;
  label: string;
  onOpen: () => void;
}) {
  if (!point) return <span className="text-gray-600">-</span>;
  if (!point.photoUrl) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-gray-500" title="Foto tidak bisa dibuka">
        <Icon name="hide_image" className="text-[16px]" />
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Lihat foto ${label}`}
      className="block w-9 h-9 rounded-lg overflow-hidden ring-1 ring-line-strong hover:ring-brand transition"
    >
      {/* Signed URL privat berumur pendek — tidak lewat optimasi next/image. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={point.photoUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
    </button>
  );
}

/** Lightbox foto selfie + detail jam, jarak, akurasi GPS, dan link lokasi. */
export function PhotoViewer({ view, onClose }: { view: PhotoView | null; onClose: () => void }) {
  useEffect(() => {
    if (!view) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, onClose]);

  return (
    <AnimatePresence>{view && <PhotoDialog key={`${view.nik}-${view.kind}`} view={view} onClose={onClose} />}</AnimatePresence>
  );
}

function PhotoDialog({ view, onClose }: { view: PhotoView; onClose: () => void }) {
  const { point } = view;
  const mapUrl = point.lat != null && point.lng != null ? `https://www.google.com/maps?q=${point.lat},${point.lng}` : null;

  return (
    <PopupLayer onClose={onClose}>
      <m.div
        {...POP}
        role="dialog"
        aria-modal="true"
        aria-label={`Foto ${KIND_LABEL[view.kind]} ${view.name}`}
        className="relative w-full max-w-sm bg-panel-inset border border-line-strong rounded-2xl overflow-hidden shadow-2xl"
      >
        <div className="px-4 py-3 border-b border-line-strong flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-ink truncate">{view.name}</p>
            <p className="text-[11px] text-gray-400">
              {KIND_LABEL[view.kind]} · {point.time} · NIK {view.nik}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup" className="p-1 rounded-lg text-gray-400 hover:text-ink hover:bg-panel">
            <Icon name="close" className="text-[20px]" />
          </button>
        </div>
        {point.photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={point.photoUrl} alt={`Selfie ${KIND_LABEL[view.kind]} ${view.name}`} className="w-full max-h-[60vh] object-contain bg-black" />
        )}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3 text-[11px]">
          {point.wfa && (
            <>
              <dt className="text-gray-500">Mode</dt>
              <dd className="text-sky-300 font-semibold text-right">WFA (di luar outlet)</dd>
            </>
          )}
          {point.branchCode && (
            <>
              <dt className="text-gray-500">Outlet</dt>
              <dd className="text-purple-300 font-semibold text-right">{point.branchCode}</dd>
            </>
          )}
          <dt className="text-gray-500">Jarak ke outlet</dt>
          <dd className="text-gray-200 text-right">{meters(point.distanceM)}</dd>
          <dt className="text-gray-500">Akurasi GPS</dt>
          <dd className="text-gray-200 text-right">{point.accuracyM == null ? "-" : `±${Math.round(point.accuracyM)} m`}</dd>
          <dt className="text-gray-500">Koordinat</dt>
          <dd className="text-gray-200 text-right font-mono">
            {point.lat != null && point.lng != null ? `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}` : "-"}
          </dd>
        </dl>
        {mapUrl && (
          <div className="px-4 pb-4">
            <a
              href={mapUrl}
              target="_blank"
              rel="noreferrer"
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-line-strong text-xs text-gray-300 hover:text-brand-ink hover:border-cyan-500/50 transition"
            >
              <Icon name="location_on" className="text-[16px]" />
              Lihat lokasi di Google Maps
            </a>
          </div>
        )}
      </m.div>
    </PopupLayer>
  );
}
