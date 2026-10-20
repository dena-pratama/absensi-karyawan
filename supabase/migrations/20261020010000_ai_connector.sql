-- =====================================================================
-- Konektor AI (Smart AI Analytics)
-- Jalankan sekali di SQL Editor Supabase SETELAH init_schema.sql.
--
-- Satu baris per provider (anthropic / openai / gemini). Hanya satu yang aktif.
-- API key disimpan TERENKRIPSI (AES-256-GCM) oleh server Next.js memakai
-- AI_ENCRYPTION_KEY di .env.local — database tidak pernah melihat key asli,
-- dan key tidak pernah dikirim ke browser.
-- =====================================================================

create table public.ai_connector (
  id                 uuid primary key default gen_random_uuid(),
  provider           text not null unique check (provider in ('anthropic','openai','gemini')),
  model              text not null,
  api_key_ciphertext text not null,              -- iv.tag.ciphertext (base64url)
  api_key_last4      text not null,              -- untuk ditampilkan: "••••abcd"
  is_active          boolean not null default false,
  updated_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Maksimal satu konektor aktif
create unique index ai_connector_one_active on public.ai_connector (is_active) where is_active;

create trigger trg_ai_connector_updated before update on public.ai_connector
  for each row execute function public.set_updated_at();

alter table public.ai_connector enable row level security;
create policy admin_all on public.ai_connector for all to authenticated using (true) with check (true);
