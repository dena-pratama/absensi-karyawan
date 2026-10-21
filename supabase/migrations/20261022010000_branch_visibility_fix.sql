-- =====================================================================
-- Fix: karyawan bisa melihat daftar SEMUA cabang
-- Jalankan sekali di SQL Editor Supabase SETELAH
-- 20261022000000_backup_and_multi_branch_spv.sql. Aman dijalankan ulang.
--
-- Migrasi sebelumnya menambah policy rls_member_read (semua akun terdaftar
-- boleh membaca tabel branch) supaya SPV bisa memilih cabang tujuan backup.
-- Efek sampingnya karyawan ikut melihat semua cabang. Sekarang:
--   - policy itu dihapus → karyawan hanya melihat cabang penempatan & cabang
--     backup-nya, SPV hanya cabang-cabangnya (policy yang sudah ada);
--   - pilihan cabang tujuan backup diambil lewat fungsi backup_branch_options()
--     yang hanya mengembalikan id, kode, nama cabang aktif — khusus admin & SPV.
-- =====================================================================

drop policy if exists rls_member_read on public.branch;

create or replace function public.backup_branch_options()
returns table (id uuid, code text, name text)
language sql stable security definer set search_path = public as $$
  select b.id, b.code, b.name
  from public.branch b
  where b.status <> 'nonaktif'
    and (public.is_admin() or public.current_app_role() = 'spv')
  order by b.code
$$;

revoke execute on function public.backup_branch_options() from public, anon;
grant execute on function public.backup_branch_options() to authenticated;
