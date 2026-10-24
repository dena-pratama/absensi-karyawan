-- =====================================================================
-- Cache AI Insight di Dashboard
-- Jalankan sekali di SQL Editor Supabase. Aman dijalankan ulang.
--
-- Satu insight per cabang per hari (WIB), dibuat otomatis saat dashboard pertama
-- kali dibuka hari itu (admin / Office), lalu dipakai ulang supaya provider AI
-- tidak ditagih setiap kali halaman dibuka. Tombol "Perbarui" menimpa isinya.
-- Dibaca & ditulis hanya oleh server Next.js (secret key) setelah cek role,
-- jadi tidak ada policy untuk client: RLS aktif = tertutup untuk anon/authenticated.
-- =====================================================================

create table if not exists public.ai_insight (
  branch_id     uuid not null references public.branch(id) on delete cascade,
  insight_date  date not null,
  content       text not null check (char_length(content) <= 8000),
  model         text not null,
  generated_by  uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  primary key (branch_id, insight_date)
);

alter table public.ai_insight enable row level security;
