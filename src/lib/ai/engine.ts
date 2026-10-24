import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI, type Content, type Part } from "@google/genai";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { AI_PROVIDERS, type AiProvider } from "./providers";

export type ChatTurn = { role: "user" | "assistant"; text: string };

export type ToolDef = {
  name: string;
  description: string;
  parameters: { type: "object"; properties: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };
};

export type ToolExecutor = (name: string, args: Record<string, unknown>) => Promise<string>;

type RunParams = {
  provider: AiProvider;
  model: string;
  apiKey: string;
  /** Base URL untuk provider OpenAI-compatible (Ollama / custom). */
  baseUrl?: string | null;
  system: string;
  history: ChatTurn[];
  tools: ToolDef[];
  execute: ToolExecutor;
};

/** Batas putaran tool per pertanyaan supaya tidak berputar tanpa akhir. */
const MAX_STEPS = 8;
const MAX_TOKENS = 16000;

export class AiError extends Error {
  /** true = provider menolak karena limit / kuota / kredit habis → sarankan ganti model / platform. */
  constructor(message: string, readonly limit = false) {
    super(message);
  }
}

const LIMIT_RE = /quota|rate.?limit|too many requests|insufficient|credit|billing|exceeded|usage limit/i;
export const LIMIT_HINT = "Ganti ke model atau platform lain di Pengaturan > Konektor AI, atau tunggu kuota pulih.";

/** Pesan error ramah dari error SDK provider (status HTTP). */
function friendlyError(err: unknown): AiError {
  const status = (err as { status?: number })?.status;
  if (status === 401 || status === 403) return new AiError("API key ditolak provider. Periksa key di Pengaturan > Konektor AI.");
  if (status === 404) return new AiError("Model atau alamat API tidak ditemukan. Periksa model / base URL di Pengaturan > Konektor AI.");
  if (status === 400 && /tool|function/i.test((err as Error)?.message ?? "")) {
    return new AiError("Model ini tidak mendukung tool calling. Pilih model lain di Pengaturan > Konektor AI.");
  }
  // Server tidak bisa dihubungi (mis. Ollama di localhost / URL salah)
  if (err instanceof OpenAI.APIConnectionError) return new AiError("Server AI tidak bisa dihubungi. Periksa base URL dan pastikan server bisa diakses dari internet.");
  if (status === 429 || status === 402 || (status && status < 500 && LIMIT_RE.test((err as Error)?.message ?? ""))) {
    return new AiError(`Model AI kena limit / kuota habis di provider. ${LIMIT_HINT}`, true);
  }
  if (status && status >= 500) return new AiError("Server provider AI sedang bermasalah. Coba lagi nanti.");
  if (err instanceof AiError) return err;
  return new AiError(`Gagal menghubungi AI: ${(err as Error)?.message ?? "error tidak dikenal"}`);
}

const safeParse = (s: string): Record<string, unknown> => {
  try {
    const v = JSON.parse(s || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
};

/* ------------------------------- Claude ------------------------------- */

async function runAnthropic({ model, apiKey, system, history, tools, execute }: RunParams): Promise<string> {
  const client = new Anthropic({ apiKey });
  const messages: Anthropic.MessageParam[] = history.map((h) => ({ role: h.role, content: h.text }));
  const anthropicTools: Anthropic.Tool[] = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters as Anthropic.Tool.InputSchema,
  }));

  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await client.messages.create({ model, max_tokens: MAX_TOKENS, system, tools: anthropicTools, messages });

    if (response.stop_reason === "refusal") {
      return "Maaf, permintaan ini tidak bisa saya proses. Coba ubah pertanyaannya.";
    }
    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }

    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      return response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
    }

    // Simpan seluruh content (termasuk blok thinking) agar konteks tetap utuh.
    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const call of toolUses) {
      const input = call.input && typeof call.input === "object" ? (call.input as Record<string, unknown>) : {};
      results.push({ type: "tool_result", tool_use_id: call.id, content: await execute(call.name, input) });
    }
    messages.push({ role: "user", content: results });
  }
  return "Analisis terlalu panjang. Coba persempit pertanyaannya (misalnya pilih cabang atau rentang tanggal).";
}

/* ------------------------- OpenAI & kompatibel ------------------------- */

/** Client OpenAI; provider compat memakai base URL-nya sendiri (key boleh kosong, mis. Ollama). */
function openaiClient(provider: AiProvider, apiKey: string, baseUrl?: string | null) {
  const meta = AI_PROVIDERS[provider];
  if (meta.kind !== "compat") return new OpenAI({ apiKey });
  const url = meta.baseUrl ?? baseUrl;
  if (!url) throw new AiError("Base URL belum diisi di Pengaturan > Konektor AI.");
  return new OpenAI({ apiKey: apiKey || "tanpa-key", baseURL: url, maxRetries: 1, timeout: 120_000 });
}

async function runOpenAI({ provider, model, apiKey, baseUrl, system, history, tools, execute }: RunParams): Promise<string> {
  const client = openaiClient(provider, apiKey, baseUrl);
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    ...history.map((h) => ({ role: h.role, content: h.text }) as ChatCompletionMessageParam),
  ];
  const openaiTools = tools.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await client.chat.completions.create({ model, messages, tools: openaiTools });
    const message = response.choices[0]?.message;
    if (!message) return "";
    const calls = (message.tool_calls ?? []).filter((c) => c.type === "function");
    if (calls.length === 0) return (message.content ?? message.refusal ?? "").trim();

    messages.push({ role: "assistant", content: message.content ?? null, tool_calls: calls });
    for (const call of calls) {
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: await execute(call.function.name, safeParse(call.function.arguments)),
      });
    }
  }
  return "Analisis terlalu panjang. Coba persempit pertanyaannya (misalnya pilih cabang atau rentang tanggal).";
}

/* ------------------------------- Gemini ------------------------------- */

async function runGemini({ model, apiKey, system, history, tools, execute }: RunParams): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });
  const contents: Content[] = history.map((h) => ({ role: h.role === "assistant" ? "model" : "user", parts: [{ text: h.text }] }));
  const config = {
    systemInstruction: system,
    tools: [
      {
        functionDeclarations: tools.map((t) => ({
          name: t.name,
          description: t.description,
          parametersJsonSchema: t.parameters,
        })),
      },
    ],
  };

  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await ai.models.generateContent({ model, contents, config });
    const calls = response.functionCalls ?? [];
    const modelContent = response.candidates?.[0]?.content;
    if (calls.length === 0 || !modelContent) return (response.text ?? "").trim();

    contents.push(modelContent);
    const parts: Part[] = [];
    for (const call of calls) {
      const result = await execute(call.name ?? "", call.args ?? {});
      parts.push({ functionResponse: { id: call.id, name: call.name, response: { result } } });
    }
    contents.push({ role: "user", parts });
  }
  return "Analisis terlalu panjang. Coba persempit pertanyaannya (misalnya pilih cabang atau rentang tanggal).";
}

/** Jalankan percakapan + tool loop pada provider yang dipilih. */
export async function runAgent(params: RunParams): Promise<string> {
  try {
    const kind = AI_PROVIDERS[params.provider].kind;
    if (kind === "anthropic") return await runAnthropic(params);
    if (kind === "gemini") return await runGemini(params);
    return await runOpenAI(params); // openai & compat
  } catch (err) {
    throw friendlyError(err);
  }
}

/** Daftar model yang bisa dipakai (sekaligus tes API key). */
export async function listModels(provider: AiProvider, apiKey: string, baseUrl?: string | null): Promise<string[]> {
  try {
    const ids: string[] = [];
    const kind = AI_PROVIDERS[provider].kind;
    if (kind === "anthropic") {
      for await (const m of new Anthropic({ apiKey }).models.list()) ids.push(m.id);
    } else if (kind === "openai" || kind === "compat") {
      for await (const m of openaiClient(provider, apiKey, baseUrl).models.list()) ids.push(m.id);
    } else {
      const pager = await new GoogleGenAI({ apiKey }).models.list();
      for await (const m of pager) {
        if (m.name && (m.supportedActions ?? []).includes("generateContent")) ids.push(m.name.replace(/^models\//, ""));
      }
    }
    return ids.sort();
  } catch (err) {
    throw friendlyError(err);
  }
}
