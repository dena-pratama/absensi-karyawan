/** Metadata provider AI (aman dipakai di client). */
export type AiProvider = "anthropic" | "openai" | "gemini";

export const AI_PROVIDERS: Record<AiProvider, { label: string; defaultModel: string; keyHint: string; keyUrl: string }> = {
  anthropic: {
    label: "Claude (Anthropic)",
    defaultModel: "claude-opus-5-5",
    keyHint: "sk-ant-...",
    keyUrl: "https://platform.claude.com/settings/keys",
  },
  openai: {
    label: "OpenAI",
    defaultModel: "",
    keyHint: "sk-...",
    keyUrl: "https://platform.openai.com/api-keys",
  },
  gemini: {
    label: "Google Gemini",
    defaultModel: "",
    keyHint: "AIza...",
    keyUrl: "https://aistudio.google.com/apikey",
  },
};

export const isAiProvider = (v: string): v is AiProvider => v in AI_PROVIDERS;

export type ConnectorInfo = {
  provider: AiProvider;
  model: string;
  last4: string;
  isActive: boolean;
  updatedAt: string;
};
