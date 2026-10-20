"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { Circle, CircleMarker, Map as LeafletMap } from "leaflet";
import type { LatLng } from "@/lib/geo";

/** Tampilan awal saat cabang belum punya titik (Jakarta). */
const DEFAULT_VIEW = { center: [-6.2, 106.816] as [number, number], zoom: 11 };
const BRAND = "#00d2ff";

/**
 * Peta interaktif (Leaflet + OpenStreetMap): klik untuk memilih titik cabang,
 * lingkaran menunjukkan radius absen. Leaflet dimuat di browser saja.
 */
export function MapPicker({
  point,
  radius,
  onPick,
  disabled = false,
}: {
  point: LatLng | null;
  radius: number;
  onPick: (p: LatLng) => void;
  disabled?: boolean;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const area = useRef<{ circle: Circle; dot: CircleMarker } | null>(null);
  const leaflet = useRef<typeof import("leaflet") | null>(null);
  const [ready, setReady] = useState(false);
  const pick = useEffectEvent((p: LatLng) => {
    if (!disabled) onPick(p);
  });

  // Buat peta sekali saat komponen tampil.
  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((mod) => {
      if (cancelled || !el.current) return;
      const L = mod.default ?? mod;
      leaflet.current = L;
      const m = L.map(el.current, { scrollWheelZoom: false }).setView(DEFAULT_VIEW.center, DEFAULT_VIEW.zoom);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(m);
      m.on("click", (e) => pick({ lat: e.latlng.lat, lng: e.latlng.lng }));
      map.current = m;
      setReady(true);
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      area.current = null;
    };
  }, []);

  // Sinkronkan titik & lingkaran radius dengan props.
  useEffect(() => {
    const L = leaflet.current;
    const m = map.current;
    if (!ready || !L || !m) return;
    if (!point) {
      area.current?.circle.remove();
      area.current?.dot.remove();
      area.current = null;
      return;
    }
    const at: [number, number] = [point.lat, point.lng];
    const isNew = !area.current;
    if (area.current) {
      area.current.circle.setLatLng(at).setRadius(radius);
      area.current.dot.setLatLng(at);
    } else {
      area.current = {
        circle: L.circle(at, { radius, color: BRAND, weight: 2, fillColor: BRAND, fillOpacity: 0.15 }).addTo(m),
        dot: L.circleMarker(at, { radius: 6, color: "#ffffff", weight: 2, fillColor: BRAND, fillOpacity: 1 }).addTo(m),
      };
    }
    // Titik baru / di luar layar → arahkan peta ke lingkarannya.
    const bounds = area.current.circle.getBounds();
    if (isNew || !m.getBounds().contains(bounds)) m.fitBounds(bounds, { padding: [24, 24], maxZoom: 18 });
  }, [ready, point, radius]);

  return (
    <div
      ref={el}
      role="application"
      aria-label="Peta pemilihan titik cabang. Klik peta untuk menaruh titik."
      className={`isolate w-full h-64 rounded-lg border border-line-strong bg-panel ${disabled ? "pointer-events-none" : "cursor-crosshair"}`}
    />
  );
}
