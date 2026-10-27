-- =====================================================================
-- Hari libur tetap mingguan per karyawan (penanda saja)
-- Jalankan sekali di SQL Editor Supabase. Aman dijalankan ulang.
--
-- Keputusan user (2026-10-27): cukup penanda di web. Admin mengisi hari libur tetap tiap
-- karyawan (mis. Senin) di Tambah / Edit Karyawan; Rekap Bulanan menandai hari itu.
-- Tidak mengubah absensi, persentase, kasbon, maupun app HP.
-- Nilai = hari dalam minggu: 0 Minggu, 1 Senin, ... 6 Sabtu.
-- =====================================================================

alter table public.employee add column if not exists day_off_weekdays smallint[] not null default '{}';

alter table public.employee drop constraint if exists employee_day_off_weekdays_check;
alter table public.employee add constraint employee_day_off_weekdays_check
  check (day_off_weekdays <@ array[0,1,2,3,4,5,6]::smallint[] and cardinality(day_off_weekdays) <= 7);

notify pgrst, 'reload schema';
