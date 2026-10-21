"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/icon";
import {
  formatLatLng,
  GEOFENCE_MAX_M,
  GEOFENCE_MIN_M,
  GEOFENCE_PRESETS_M,
  mapsUrl,
  parseLatLng,
  type LatLng,
} from "@/lib/geo";
import { Field, inputCls } from "../_components/ui";
import { MapPicker } from "./map-picker";

type Place = { name: string; point: LatLng };

/**
 * Cari tempat lewat OpenStreetMap Nominatim (gratis, tanpa API key).
 * Kebijakan pemakaian: maks. ±1 request/detik → hanya saat tombol Cari ditekan.
 */
async function searchPlaces(q: string): Promise<Place[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=id&accept-language=id&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(String(res.status));
  const rows = (await res.json()) as { display_name: string; lat: string; lon: string }[];
  return rows.map((r) => ({ name: r.display_name, point: { lat: Number(r.lat), lng: Number(r.lon) } }));
}

const ghostBtn =
  "h-[34px] px-3 rounded-lg border border-line-strong text-xs text-gray-300 hover:text-brand-ink hover:border-cyan-500/50 transition flex items-center justify-center gap-1.5 whitespace-nowrap";

function Spinner() {
  return <span className="w-3.5 h-3.5 rounded-full border-2 border-gray-400 border-t-transparent animate-spin" />;
}

/**
 * Bagian "Area GPS Absen" di form cabang: cari tempat / klik peta / tempel koordinat,
 * lalu atur radius. App mobile hanya menerima absen di dalam lingkaran ini.
 */
export function GeoAreaField({
  point,
  radius,
  onChange,
  disabled = false,
}: {
  point: LatLng | null;
  radius: number;
  onChange: (v: { point: LatLng | null; radius: number }) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState(point ? formatLatLng(point) : "");
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [searching, startSearch] = useTransition();

  const setPoint = (p: LatLng | null) => {
    setError(null);
    setText(p ? formatLatLng(p) : "");
    onChange({ point: p, radius });
  };

  const onText = (value: string) => {
    setText(value);
    if (!value.trim()) {
      setError(null);
      onChange({ point: null, radius });
      return;
    }
    const p = parseLatLng(value);
    setError(p ? null : "Format belum dikenali. Contoh: -6.200000, 106.816666");
    if (p) onChange({ point: p, radius });
  };

  const search = () => {
    const q = query.trim();
    if (q.length < 3) return setError("Ketik minimal 3 huruf untuk mencari tempat.");
    startSearch(async () => {
      try {
        const found = await searchPlaces(q);
        setPlaces(found);
        setError(found.length ? null : "Tempat tidak ditemukan. Coba kata lain, atau klik langsung di peta.");
      } catch {
        setPlaces(null);
        setError("Gagal mencari tempat. Coba lagi, atau klik langsung di peta.");
      }
    });
  };

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) return setError("Browser tidak mendukung lokasi.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setPoint({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        if (pos.coords.accuracy > 50) setError(`Akurasi lokasi ±${Math.round(pos.coords.accuracy)} m. Periksa titiknya di peta.`);
      },
      (err) => {
        setLocating(false);
        setError(err.code === err.PERMISSION_DENIED ? "Izin lokasi ditolak browser." : "Gagal membaca lokasi. Coba lagi.");
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  const setRadius = (r: number) => onChange({ point, radius: r });

  return (
    <fieldset disabled={disabled} className="rounded-lg border border-line-strong bg-panel-inset p-3.5 space-y-3 disabled:opacity-60">
      <legend className="px-1 text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
        <Icon name="my_location" className="text-[15px] text-brand-ink" />
        Area GPS Absen
      </legend>

      {/* Cari tempat */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Icon name="search" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-gray-500 pointer-events-none" />
          <input
            className={`${inputCls} pl-8`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            // Enter mencari tempat, bukan menyimpan form modal.
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                search();
              }
            }}
            placeholder="Cari tempat / alamat, mis. Gudang Cakung Jakarta"
            aria-label="Cari tempat"
          />
        </div>
        <button type="button" onClick={search} className={ghostBtn}>
          {searching ? <Spinner /> : <Icon name="travel_explore" className="text-[16px]" />}
          Cari
        </button>
        <button type="button" onClick={useMyLocation} className={ghostBtn}>
          {locating ? <Spinner /> : <Icon name="near_me" className="text-[16px]" />}
          Lokasi saya
        </button>
      </div>
      {places && places.length > 0 && (
        <ul className="rounded-lg border border-line-strong bg-panel divide-y divide-line overflow-hidden" aria-label="Hasil pencarian tempat">
          {places.map((p) => (
            <li key={`${p.point.lat},${p.point.lng}`}>
              <button
                type="button"
                onClick={() => {
                  setPoint(p.point);
                  setPlaces(null);
                }}
                className="w-full text-left px-3 py-2 text-[11px] text-gray-300 hover:bg-panel-raised hover:text-brand-ink flex items-start gap-2"
              >
                <Icon name="location_on" className="text-[15px] text-gray-500 mt-px" />
                <span className="line-clamp-2">{p.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-[11px] text-amber-300">{error}</p>}

      {/* Peta: klik untuk menaruh titik */}
      <div className="space-y-1">
        <MapPicker point={point} radius={Math.max(radius, GEOFENCE_MIN_M)} onPick={setPoint} disabled={disabled} />
        <p className="text-[10px] text-gray-500 flex items-center gap-1">
          <Icon name="touch_app" className="text-[13px]" />
          Klik peta untuk menaruh / memindahkan titik. Zoom dengan tombol + / − atau klik dua kali.
        </p>
      </div>

      {/* Koordinat & radius */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Titik koordinat" hint="Bisa juga tempel dari Google Maps atau link Maps.">
          <input
            className={`${inputCls} font-mono`}
            value={text}
            onChange={(e) => onText(e.target.value)}
            placeholder="-6.200000, 106.816666"
            inputMode="decimal"
          />
        </Field>
        <div>
          <span className="block text-[11px] font-medium text-slate-300 mb-1">Radius absen</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {GEOFENCE_PRESETS_M.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRadius(r)}
                aria-pressed={radius === r}
                className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold transition ${
                  radius === r ? "bg-cyan-500/15 text-brand-ink border-cyan-500/40" : "border-line-strong text-gray-400 hover:text-gray-200"
                }`}
              >
                {r} m
              </button>
            ))}
            <span className="flex items-center gap-1.5">
              <input
                type="number"
                min={GEOFENCE_MIN_M}
                max={GEOFENCE_MAX_M}
                step={10}
                value={radius}
                onChange={(e) => setRadius(Math.round(Number(e.target.value) || 0))}
                aria-label="Radius dalam meter"
                className={`${inputCls} w-20 py-1`}
              />
              <span className="text-[11px] text-gray-400">m</span>
            </span>
          </div>
          {(radius < GEOFENCE_MIN_M || radius > GEOFENCE_MAX_M) && (
            <p className="text-[11px] text-rose-300 mt-1">
              Radius harus {GEOFENCE_MIN_M}–{GEOFENCE_MAX_M} meter.
            </p>
          )}
        </div>
      </div>

      {point ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-400">
          <span>
            Karyawan bisa absen dalam radius <span className="font-semibold text-gray-200">{radius} m</span> dari titik ini.
          </span>
          <span className="flex items-center gap-3">
            <a href={mapsUrl(point)} target="_blank" rel="noreferrer" className="text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-1">
              <Icon name="open_in_new" className="text-[13px]" />
              Buka di Google Maps
            </a>
            <button type="button" onClick={() => setPoint(null)} className="text-gray-400 hover:text-rose-400">
              Hapus titik
            </button>
          </span>
        </div>
      ) : (
        <p className="text-[11px] text-gray-500 flex items-center gap-1.5">
          <Icon name="location_off" className="text-[15px]" />
          Titik belum diatur, jadi karyawan cabang ini belum bisa absen lewat app mobile.
        </p>
      )}
    </fieldset>
  );
}
