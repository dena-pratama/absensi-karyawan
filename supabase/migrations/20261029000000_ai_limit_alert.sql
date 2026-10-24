-- =====================================================================
-- Konektor AI: penanda "kena limit"
-- Jalankan sekali di SQL Editor Supabase. Aman dijalankan ulang.
--
-- Saat provider menolak karena limit / kuota habis (HTTP 429 / 402 atau pesan
-- quota / rate limit / credit), server mencatat waktunya di konektor aktif supaya
-- admin mendapat pengingat untuk mengganti model / platform. Penanda dihapus lagi
-- otomatis saat panggilan berikutnya berhasil atau konektor disimpan ulang.
-- =====================================================================

alter table public.ai_connector add column if not exists limited_at timestamptz;
alter table public.ai_connector add column if not exists limit_message text check (char_length(limit_message) <= 500);
