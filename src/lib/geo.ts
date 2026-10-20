/** Area GPS absen cabang (lihat migrasi branch_geofence). */
export const GEOFENCE_DEFAULT_M = 100;
export const GEOFENCE_MIN_M = 10;
export const GEOFENCE_MAX_M = 5000;
export const GEOFENCE_PRESETS_M = [50, 100, 200, 500];

export type LatLng = { lat: number; lng: number };

const NUM = String.raw`[-+]?\d{1,3}(?:[.,]\d+)?`;
const PAIR_RE = new RegExp(`(${NUM})\\s*[,;\\s]\\s*(${NUM})`);

const toNum = (s: string) => Number(s.replace(",", "."));

export function isValidLatLng(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

/**
 * Ambil "lat, lng" dari teks bebas: hasil salin Google Maps ("-6.200000, 106.816666"),
 * link Maps (…/@-6.2,106.81,17z atau ?q=-6.2,106.81), atau dua angka berpisah spasi.
 */
export function parseLatLng(text: string): LatLng | null {
  const t = text.trim();
  const at = t.match(new RegExp(`@(${NUM}),(${NUM})`));
  const q = t.match(new RegExp(`[?&](?:q|query|ll)=(${NUM}),(${NUM})`));
  const m = at ?? q ?? (t.match(/^https?:/) ? null : t.match(PAIR_RE));
  if (!m) return null;
  const lat = toNum(m[1]);
  const lng = toNum(m[2]);
  return isValidLatLng(lat, lng) ? { lat, lng } : null;
}

/** Format tampilan / salin: 6 desimal ≈ 0,1 m. */
export const formatLatLng = (p: LatLng) => `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`;

/** Link Google Maps untuk titik ini. */
export const mapsUrl = (p: LatLng) => `https://www.google.com/maps?q=${p.lat},${p.lng}`;
