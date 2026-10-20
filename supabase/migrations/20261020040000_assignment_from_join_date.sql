-- =====================================================================
-- Penempatan pertama dimulai dari tanggal bergabung
-- Jalankan sekali di SQL Editor Supabase. Aman dijalankan ulang.
--
-- Sebelumnya penempatan karyawan baru selalu mulai "hari disimpan", jadi
-- absensi tanggal sebelumnya tidak bisa diisi (karyawan tidak muncul di
-- roster). Ini memundurkan penempatan PERTAMA tiap karyawan ke join_date
-- bila join_date lebih awal. Karyawan tanpa join_date tidak berubah.
-- Tidak ada data absensi yang diubah.
-- =====================================================================

update public.employee_assignment a
set    valid_from = e.join_date
from   public.employee e
where  e.id = a.employee_id
  and  e.join_date is not null
  and  e.join_date < a.valid_from
  and  not exists (
         select 1 from public.employee_assignment p
         where  p.employee_id = a.employee_id
           and  p.valid_from < a.valid_from
       );
