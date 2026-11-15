// Vultr Serverless Inference client for the optional plain-language explanation.
// OpenAI-compatible chat completions API. Server-side only: the API key must never reach
// the browser. Every reply passes through acceptExplanation(); on any failure the engine's
// own deterministic summary is returned instead.
import type { RiskAssessment } from "../engine/types.ts";
import { buildExplanationPrompt, checkExplanation, type RejectReason } from "./prompt.ts";

export interface VultrInferenceConfig {
  apiKey: string;
  model?: string;
  /**
   * Vultr's chat models all reason before answering. For a short rephrasing that wastes
   * ~1,500 tokens and can leave the answer empty. "none" disables it on the default
   * DeepSeek and Qwen models (tested 2026-11-14); GLM models ignore "none" (use "low").
   */
  reasoningEffort?: "none" | "low" | "medium" | "high";
  maxTokens?: number;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface ExplanationResult {
  text: string;
  /** "llm" = model text passed the checks; "engine" = fell back to the engine summary. */
  source: "llm" | "engine";
  model: string;
  rejectedText?: string;
  rejectReason?: RejectReason;
  error?: string;
  attempts?: number;
  usage?: { promptTokens: number; completionTokens: number };
}

export const DEFAULT_VULTR_MODEL = "deepseek-v4.1-flash-1017";
const DEFAULT_BASE = "https://api.vultrinference.com/v1";

/** Reasoning models may prepend their thinking in <think> tags; residents never see it. */
export const stripReasoning = (t: string) => t.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^[\s\S]*<\/think>/i, "").trim();

export async function explainAssessment(a: RiskAssessment, cfg: VultrInferenceConfig): Promise<ExplanationResult> {
  const model = cfg.model ?? DEFAULT_VULTR_MODEL;
  const fallback = (extra: Partial<ExplanationResult>): ExplanationResult => ({ text: a.summary, source: "engine", model, ...extra });
  const { system, user } = buildExplanationPrompt(a);
  const f = cfg.fetchImpl ?? fetch;
  const body = JSON.stringify({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_tokens: cfg.maxTokens ?? 400,
    temperature: 0.2,
    reasoning_effort: cfg.reasoningEffort ?? "none",
  });

  // One retry for network failures and 429/5xx; 4xx (bad key, bad request) is not retried.
  let lastError = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs ?? 30_000);
    try {
      const res = await f(`${cfg.baseUrl ?? DEFAULT_BASE}/chat/completions`, {
        method: "POST",
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
        body,
      });
      if (!res.ok) {
        lastError = `HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`;
        if (res.status === 429 || res.status >= 500) continue;
        return fallback({ error: lastError, attempts: attempt });
      }
      const json = (await res.json()) as {
        choices?: { message?: { content?: string | null } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const text = stripReasoning(json?.choices?.[0]?.message?.content ?? "");
      const usage = json?.usage ? { promptTokens: json.usage.prompt_tokens ?? 0, completionTokens: json.usage.completion_tokens ?? 0 } : undefined;
      const reason = checkExplanation(a, text);
      if (reason) return fallback({ rejectedText: text, rejectReason: reason, usage, attempts: attempt });
      return { text, source: "llm", model, usage, attempts: attempt };
    } catch (e) {
      lastError = String(e);
    } finally {
      clearTimeout(timer);
    }
  }
  return fallback({ error: lastError, attempts: 2 });
}
