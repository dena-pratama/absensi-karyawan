-- =====================================================================
-- Kode cabang & NIK karyawan bebas format
-- Jalankan sekali di SQL Editor Supabase. Aman dijalankan ulang.
--
-- Sebelumnya branch.code wajib pola 3 huruf + 3 angka + 1 huruf (JKT109A).
-- Sekarang kode cabang dan NIK boleh berisi karakter apa saja (huruf besar/
-- kecil, angka, simbol, spasi): cukup tidak kosong dan maks. 30 karakter.
-- Keunikan tetap dijaga oleh constraint UNIQUE yang sudah ada.
-- Data lama tidak berubah.
-- =====================================================================

-- Hapus check pola lama (nama otomatis dari Postgres untuk check di kolom code)
alter table public.branch drop constraint if exists branch_code_check;

alter table public.branch   drop constraint if exists branch_code_length;
alter table public.branch   add  constraint branch_code_length
  check (length(btrim(code)) between 1 and 30);

alter table public.employee drop constraint if exists employee_nik_length;
alter table public.employee add  constraint employee_nik_length
  check (length(btrim(nik)) between 1 and 30);
