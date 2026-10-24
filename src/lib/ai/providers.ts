/** Metadata provider AI (aman dipakai di client). */
export type AiProvider = "anthropic" | "openai" | "gemini" | "deepseek" | "openrouter" | "groq" | "mistral" | "xai" | "ollama" | "custom";

/**
 * kind = SDK yang dipakai. "compat" = API yang kompatibel dengan OpenAI Chat Completions
 * (dipanggil lewat SDK OpenAI dengan baseURL lain).
 */
export type ProviderMeta = {
  label: string;
  kind: "anthropic" | "openai" | "gemini" | "compat";
  defaultModel: string;
  keyHint: string;
  keyUrl: string;
  /** URL API tetap untuk provider compat. */
  baseUrl?: string;
  /** Base URL diisi admin (Ollama / server sendiri). Nilai ini contoh untuk placeholder. */
  baseUrlPlaceholder?: string;
  keyOptional?: boolean;
  note?: string;
};

export const AI_PROVIDERS: Record<AiProvider, ProviderMeta> = {
  anthropic: {
    label: "Claude (Anthropic)",
    kind: "anthropic",
    defaultModel: "claude-opus-5-5",
    keyHint: "sk-ant-...",
    keyUrl: "https://platform.claude.com/settings/keys",
  },
  openai: {
    label: "OpenAI",
    kind: "openai",
    defaultModel: "",
    keyHint: "sk-...",
    keyUrl: "https://platform.openai.com/api-keys",
  },
  gemini: {
    label: "Google Gemini",
    kind: "gemini",
    defaultModel: "",
    keyHint: "AIza...",
    keyUrl: "https://aistudio.google.com/apikey",
  },
  deepseek: {
    label: "DeepSeek",
    kind: "compat",
    baseUrl: "https://api.deepseek.com",
    defaultModel: "deepseek-chat",
    keyHint: "sk-...",
    keyUrl: "https://platform.deepseek.com/api_keys",
  },
  openrouter: {
    label: "OpenRouter",
    kind: "compat",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "",
    keyHint: "sk-or-...",
    keyUrl: "https://openrouter.ai/settings/keys",
    note: "Satu key untuk banyak model (Llama, Qwen, DeepSeek, dll). Pilih model yang mendukung tool calling.",
  },
  groq: {
    label: "Groq",
    kind: "compat",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "",
    keyHint: "gsk_...",
    keyUrl: "https://console.groq.com/keys",
  },
  mistral: {
    label: "Mistral AI",
    kind: "compat",
    baseUrl: "https://api.mistral.ai/v1",
    defaultModel: "",
    keyHint: "API key Mistral",
    keyUrl: "https://console.mistral.ai/api-keys",
  },
  xai: {
    label: "xAI Grok",
    kind: "compat",
    baseUrl: "https://api.x.ai/v1",
    defaultModel: "",
    keyHint: "xai-...",
    keyUrl: "https://console.x.ai",
  },
  ollama: {
    label: "Ollama",
    kind: "compat",
    baseUrlPlaceholder: "https://ollama.domain-anda.com/v1",
    defaultModel: "",
    keyHint: "opsional",
    keyUrl: "https://ollama.com",
    keyOptional: true,
    note: "Isi URL server Ollama (akhiri dengan /v1). Web ini berjalan di Vercel, jadi localhost tidak bisa dipakai: server Ollama harus bisa diakses dari internet. Pilih model yang mendukung tool calling (mis. qwen, llama 3.1+).",
  },
  custom: {
    label: "OpenAI-compatible",
    kind: "compat",
    baseUrlPlaceholder: "https://api.provider.com/v1",
    defaultModel: "",
    keyHint: "API key provider",
    keyUrl: "https://platform.openai.com/docs/api-reference/chat",
    keyOptional: true,
    note: "Untuk provider lain yang mendukung API Chat Completions ala OpenAI (mis. Together, Fireworks, vLLM, LM Studio).",
  },
};

export const isAiProvider = (v: string): v is AiProvider => v in AI_PROVIDERS;

/** Provider yang base URL-nya diisi admin. */
export const needsBaseUrl = (p: AiProvider) => AI_PROVIDERS[p].kind === "compat" && !AI_PROVIDERS[p].baseUrl;

export type ConnectorInfo = {
  provider: AiProvider;
  model: string;
  last4: string;
  baseUrl: string | null;
  /** Waktu terakhir provider menolak karena limit / kuota (null = normal). */
  limitedAt: string | null;
  limitMessage: string | null;
  isActive: boolean;
  updatedAt: string;
};
