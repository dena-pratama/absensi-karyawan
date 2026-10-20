-- =====================================================================
-- QC database (v0.2) — opsional, jalankan sekali di SQL Editor Supabase
-- SETELAH init_schema.sql & ai_connector.sql. Aman dijalankan ulang.
--
-- 1. Index untuk foreign key yang belum ber-index. PostgreSQL tidak membuat
--    index FK otomatis; tanpa index ini, hapus/ubah jabatan, cabang, cluster,
--    atau karyawan (PIC) harus memindai seluruh tabel anak.
-- 2. Hapus view v_rekap_bulanan: tidak dipakai app (rekap dihitung di
--    src/lib/data/rekap.ts langsung dari attendance_daily).
-- =====================================================================

create index if not exists employee_assignment_job_role_idx on public.employee_assignment (job_role_id);
create index if not exists attendance_daily_job_role_idx    on public.attendance_daily (job_role_id);
create index if not exists branch_cluster_idx               on public.branch (cluster_id);
create index if not exists branch_pic_employee_idx          on public.branch (pic_employee_id);

drop view if exists public.v_rekap_bulanan;
