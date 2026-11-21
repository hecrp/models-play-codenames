import type { Usage, ModelInfo } from "@/lib/types";
import type { FunctionTool, ToolChoice } from "@/lib/codenames/tools";
import type { Language } from "@/lib/codenames/types";
import { gameText } from "@/lib/codenames/messages";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export class OpenRouterError extends Error {
  status: number;
  retryable: boolean;
  aborted: boolean;
  retryAfterMs?: number;

  constructor(
    status: number,
    message: string,
    options: { retryable?: boolean; aborted?: boolean; retryAfterMs?: number } = {},
  ) {
    super(message);
    this.name = "OpenRouterError";
    this.status = status;
    this.retryable = options.retryable ?? (status === 429 || status >= 500);
    this.aborted = options.aborted ?? false;
    this.retryAfterMs = options.retryAfterMs;
  }
}

function parseRetryAfter(headers: Headers): number | undefined {
  const retryAfter = headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  // OpenRouter sends the reset as an epoch in milliseconds.
  const reset = Number(headers.get("x-ratelimit-reset"));
  if (Number.isFinite(reset) && reset > 0) {
    return Math.max(0, reset - Date.now());
  }
  return undefined;
}

function sleepWithSignal(ms: number, signal?: AbortSignal, cancelled = "Request cancelled."): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new OpenRouterError(0, cancelled, { aborted: true }));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new OpenRouterError(0, cancelled, { aborted: true }));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function resolveOpenRouterKey(explicit?: string | null): string | null {
  const key = explicit?.trim() || process.env.OPENROUTER_API_KEY?.trim();
  return key || null;
}

export function friendlyUpstreamError(
  status: number,
  rawMessage: string,
  lang: Language = "es",
): string {
  const text = gameText(lang).upstream;
  const detail = rawMessage.trim().slice(0, 600);
  if (status === 401) return text.unauthorized;
  if (status === 402) return text.noCredit;
  if (status === 429) return text.rateLimited;
  if (status === 404) return text.notFound;
  if (status >= 500) {
    return `${text.serverError(status)}${detail ? ` ${detail}` : ""}`;
  }
  return detail || text.rejected(status);
}

function normalizeContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object") {
          const text = (part as Record<string, unknown>).text;
          return typeof text === "string" ? text : "";
        }
        return "";
      })
      .join("");
  }
  return "";
}

export function extractReasoning(message: Record<string, unknown>): string {
  if (typeof message.reasoning === "string" && message.reasoning) {
    return message.reasoning;
  }
  if (
    typeof message.reasoning_content === "string" &&
    message.reasoning_content
  ) {
    return message.reasoning_content;
  }
  if (Array.isArray(message.reasoning_details)) {
    return message.reasoning_details
      .map((detail) => {
        if (!detail || typeof detail !== "object") return "";
        const text = (detail as Record<string, unknown>).text;
        return typeof text === "string" ? text : "";
      })
      .join("");
  }
  return "";
}

export function mapUsage(raw: unknown): Usage | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const usage = raw as Record<string, unknown>;
  const prompt = Number(usage.prompt_tokens) || 0;
  const completion = Number(usage.completion_tokens) || 0;
  const total = Number(usage.total_tokens) || prompt + completion;
  const cost =
    typeof usage.cost === "number"
      ? usage.cost
      : typeof usage.cost === "string"
        ? Number.parseFloat(usage.cost)
        : undefined;

  if (!prompt && !completion && !total) return undefined;

  const completionDetails = usage.completion_tokens_details as Record<string, unknown> | undefined;
  const promptDetails = usage.prompt_tokens_details as Record<string, unknown> | undefined;
  const reasoningTokens = Number(completionDetails?.reasoning_tokens);
  const cachedTokens = Number(promptDetails?.cached_tokens);

  return {
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: total,
    cost: Number.isFinite(cost) ? cost : undefined,
    ...(Number.isFinite(reasoningTokens) && reasoningTokens > 0 ? { reasoningTokens } : {}),
    ...(Number.isFinite(cachedTokens) && cachedTokens > 0 ? { cachedTokens } : {}),
  };
}

/** Fallback when a provider does not return usage.cost. Prices are per token. */
export function estimateCost(
  usage: Usage | undefined,
  model: ModelInfo | undefined,
): number | undefined {
  if (!usage || !model) return undefined;
  const { prompt, completion } = model.pricing;
  if (prompt < 0 || completion < 0) return undefined;
  return prompt * usage.promptTokens + completion * usage.completionTokens;
}

export interface ToolCallResult {
  name: string;
  argumentsRaw: string;
}

export interface ToolCompletion {
  toolCalls: ToolCallResult[];
  content: string;
  reasoning: string;
  usage?: Usage;
  latencyMs: number;
  finishReason?: string;
  toolChoiceFallback: boolean;
  /** Upstream provider that served the call (DeepInfra, Groq…). */
  provider?: string;
  /** Retries after 429/5xx/network failures before the final response. */
  retries: number;
}

export interface ToolCompletionOptions {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  tools: FunctionTool[];
  toolChoice: ToolChoice;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  includeReasoning?: boolean;
  reasoningEffort?: "low" | "medium" | "high";
  /** OpenRouter provider routing preferences, sent as-is (order, allow_fallbacks…). */
  provider?: Record<string, unknown>;
  signal?: AbortSignal;
  maxRetries?: number;
  /** Language for error messages that end up in the game log. */
  lang?: Language;
}

interface RequestOutcome {
  data: Record<string, unknown>;
  latencyMs: number;
  retries?: number;
}

async function requestOnce(
  options: ToolCompletionOptions,
  toolChoice: ToolChoice,
): Promise<RequestOutcome> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onAbort, { once: true });

  const payload: Record<string, unknown> = {
    model: options.model,
    messages: [
      { role: "system", content: options.systemPrompt },
      { role: "user", content: options.userPrompt },
    ],
    tools: options.tools,
    tool_choice: toolChoice,
    max_tokens: options.maxTokens ?? 2000,
    stream: false,
    usage: { include: true },
  };
  if (options.temperature !== undefined) payload.temperature = options.temperature;
  if (options.provider) payload.provider = options.provider;
  if (options.includeReasoning) {
    payload.reasoning = {
      effort: options.reasoningEffort ?? "low",
      exclude: false,
    };
  }

  const started = performance.now();
  let response: Response;
  try {
    response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer":
          process.env.OPENROUTER_SITE_URL ?? "http://localhost:3000",
        "X-Title": process.env.OPENROUTER_SITE_NAME ?? "Models play Codenames",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    const text = gameText(options.lang).upstream;
    if (options.signal?.aborted) {
      throw new OpenRouterError(0, text.cancelled, { aborted: true });
    }
    if (controller.signal.aborted) {
      throw new OpenRouterError(0, text.timeout(Math.round(timeoutMs / 1000)), {
        retryable: false,
      });
    }
    throw new OpenRouterError(
      0,
      `${text.unreachable}${error instanceof Error ? ` ${error.message}` : ""}`,
      { retryable: true },
    );
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
  }

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    let upstreamMessage = raw;
    try {
      const decoded = JSON.parse(raw) as {
        error?: { message?: string } | string;
      };
      const error = decoded?.error;
      if (typeof error === "string") upstreamMessage = error;
      else if (error?.message) upstreamMessage = error.message;
    } catch {
      // Keep the raw text.
    }
    throw new OpenRouterError(
      response.status,
      friendlyUpstreamError(response.status, upstreamMessage, options.lang),
      {
        retryable: response.status === 429 || response.status >= 500,
        retryAfterMs: parseRetryAfter(response.headers),
      },
    );
  }

  let data: Record<string, unknown>;
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    throw new OpenRouterError(
      response.status,
      gameText(options.lang).upstream.notJson,
      { retryable: true },
    );
  }

  return { data, latencyMs: Math.round(performance.now() - started) };
}

const BACKOFF_BASE_MS = 1_500;
const BACKOFF_MAX_MS = 20_000;

function isToolChoiceRejection(error: unknown, toolChoice: ToolChoice): boolean {
  return (
    error instanceof OpenRouterError &&
    toolChoice !== "auto" &&
    (error.status === 400 ||
      error.status === 422 ||
      (error.status === 502 &&
        /tool.?choice|did not call a tool/i.test(error.message)))
  );
}

/** Retries 429/5xx/network failures with exponential backoff and Retry-After. */
async function requestWithBackoff(
  options: ToolCompletionOptions,
  toolChoice: ToolChoice,
): Promise<RequestOutcome> {
  const maxRetries = options.maxRetries ?? 3;
  for (let attempt = 0; ; attempt += 1) {
    try {
      const outcome = await requestOnce(options, toolChoice);
      return { ...outcome, retries: attempt };
    } catch (error) {
      if (
        !(error instanceof OpenRouterError) ||
        error.aborted ||
        !error.retryable ||
        isToolChoiceRejection(error, toolChoice) ||
        attempt >= maxRetries
      ) {
        throw error;
      }
      const wait = Math.min(
        BACKOFF_MAX_MS,
        (error.retryAfterMs ?? BACKOFF_BASE_MS * 2 ** attempt) + Math.random() * 500,
      );
      await sleepWithSignal(wait, options.signal, gameText(options.lang).upstream.cancelled);
    }
  }
}

/**
 * Non-streaming completion with tool calling, used by the Codenames agents.
 * If a provider rejects the forced tool_choice, it retries once with "auto".
 */
export async function completeWithTools(
  options: ToolCompletionOptions,
): Promise<ToolCompletion> {
  const resolvedKey = resolveOpenRouterKey(options.apiKey);
  if (!resolvedKey) {
    throw new OpenRouterError(
      401,
      gameText(options.lang).upstream.noKey,
      { retryable: false },
    );
  }
  const requestOptions: ToolCompletionOptions = {
    ...options,
    apiKey: resolvedKey,
  };

  let outcome: RequestOutcome;
  let toolChoiceFallback = false;
  try {
    outcome = await requestWithBackoff(requestOptions, requestOptions.toolChoice);
  } catch (error) {
    if (isToolChoiceRejection(error, requestOptions.toolChoice)) {
      outcome = await requestWithBackoff(requestOptions, "auto");
      toolChoiceFallback = true;
    } else {
      throw error;
    }
  }

  const { data, latencyMs } = outcome;
  const retries = outcome.retries ?? 0;
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const choice =
    choices[0] && typeof choices[0] === "object"
      ? (choices[0] as Record<string, unknown>)
      : {};
  const message =
    choice.message && typeof choice.message === "object"
      ? (choice.message as Record<string, unknown>)
      : {};

  const rawCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  const toolCalls: ToolCallResult[] = [];
  for (const rawCall of rawCalls) {
    if (!rawCall || typeof rawCall !== "object") continue;
    const call = rawCall as Record<string, unknown>;
    const fn =
      call.function && typeof call.function === "object"
        ? (call.function as Record<string, unknown>)
        : {};
    if (typeof fn.name !== "string") continue;
    toolCalls.push({
      name: fn.name,
      argumentsRaw:
        typeof fn.arguments === "string"
          ? fn.arguments
          : JSON.stringify(fn.arguments ?? {}),
    });
  }

  return {
    toolCalls,
    content: normalizeContent(message.content),
    reasoning: extractReasoning(message),
    usage: mapUsage(data.usage),
    latencyMs,
    finishReason:
      typeof choice.finish_reason === "string"
        ? choice.finish_reason
        : undefined,
    toolChoiceFallback,
    ...(typeof data.provider === "string" && data.provider ? { provider: data.provider } : {}),
    retries,
  };
}
