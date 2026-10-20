-- =====================================================================
-- Area GPS absen per cabang (geofence)
-- Jalankan sekali di SQL Editor Supabase. Aman dijalankan ulang.
--
-- Titik pusat cabang (latitude / longitude, WGS84 seperti Google Maps) dan
-- radius absen dalam meter. Dipakai app mobile: absen hanya bisa dilakukan
-- dalam radius ini. Titik kosong = area GPS belum diatur.
-- Data lama tidak berubah (radius default 100 m, titik kosong).
-- =====================================================================

alter table public.branch
  add column if not exists latitude          double precision,
  add column if not exists longitude         double precision,
  add column if not exists geofence_radius_m integer not null default 100;

-- Titik diisi berpasangan & dalam rentang koordinat yang valid
alter table public.branch drop constraint if exists branch_geo_point_valid;
alter table public.branch add  constraint branch_geo_point_valid check (
  (latitude is null and longitude is null)
  or (latitude between -90 and 90 and longitude between -180 and 180)
);

-- Radius 10 m – 5 km
alter table public.branch drop constraint if exists branch_geofence_radius_range;
alter table public.branch add  constraint branch_geofence_radius_range check (geofence_radius_m between 10 and 5000);
