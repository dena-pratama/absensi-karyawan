-- =====================================================================
-- Konektor AI: provider tambahan
-- Jalankan sekali di SQL Editor Supabase. Aman dijalankan ulang.
--
-- Selain Claude / OpenAI / Gemini, sekarang bisa: DeepSeek, OpenRouter, Groq,
-- Mistral, xAI Grok, Ollama, dan provider lain yang kompatibel dengan API OpenAI.
-- Ollama & "custom" memakai base URL yang diisi admin (kolom base_url).
-- API key tetap disimpan terenkripsi oleh server; Ollama boleh tanpa key.
-- =====================================================================

alter table public.ai_connector drop constraint if exists ai_connector_provider_check;
alter table public.ai_connector add constraint ai_connector_provider_check check (provider in (
  'anthropic','openai','gemini',
  'deepseek','openrouter','groq','mistral','xai','ollama','custom'
));

alter table public.ai_connector add column if not exists base_url text;
alter table public.ai_connector drop constraint if exists ai_connector_base_url_check;
alter table public.ai_connector add constraint ai_connector_base_url_check
  check (base_url is null or (base_url ~ '^https?://[^\s]+$' and char_length(base_url) <= 300));
