import { gameText } from "@/lib/codenames/messages";
import type { ToolChoice } from "@/lib/codenames/tools";
import type { ReasoningEffort } from "@/lib/codenames/types";
import {
  friendlyUpstreamError,
  OpenRouterError,
  parseRetryAfter,
  postWithDeadline,
  sleepWithSignal,
  type ToolCompletion,
  type ToolCompletionOptions,
} from "./openrouter";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

/** Name stored as the serving provider of a direct OpenAI call. */
export const OPENAI_PROVIDER_NAME = "OpenAI API";

const BACKOFF_BASE_MS = 1_500;
const BACKOFF_MAX_MS = 20_000;

/** OpenAI's top effort is "xhigh". */
function openaiEffort(effort: ReasoningEffort): string {
  return effort === "max" ? "xhigh" : effort;
}

/** Chat Completions tool choice → Responses API tool choice. */
function responsesToolChoice(choice: ToolChoice): unknown {
  if (typeof choice === "string") return choice;
  return { type: "function", name: choice.function.name };
}

interface Attempt {
  toolChoice: ToolChoice;
  temperature?: number;
  effort?: ReasoningEffort;
  /** Reasoning summaries need a verified organization: dropped if refused. */
  summary: boolean;
}

/** What to try next after a 400, or null when the error is not about a parameter. */
function relax(attempt: Attempt, error: OpenRouterError): Attempt | null {
  if (error.status !== 400 && error.status !== 422) return null;
  const message = error.message;
  if (attempt.summary && /summar|verif/i.test(message)) return { ...attempt, summary: false };
  if (attempt.temperature !== undefined && /temperature/i.test(message)) {
    return { ...attempt, temperature: undefined };
  }
  if (attempt.toolChoice !== "auto" && /tool.?choice/i.test(message)) {
    return { ...attempt, toolChoice: "auto" };
  }
  if (attempt.effort && /reasoning|effort/i.test(message)) return { ...attempt, effort: undefined };
  return null;
}

async function send(
  options: ToolCompletionOptions,
  attempt: Attempt,
): Promise<{ data: Record<string, unknown>; latencyMs: number }> {
  const text = gameText(options.lang).upstream;
  const timeoutMs = options.timeoutMs ?? 60_000;

  const payload: Record<string, unknown> = {
    model: options.model,
    instructions: options.systemPrompt,
    input: [{ role: "user", content: options.userPrompt }],
    tools: options.tools.map((tool) => ({
      type: "function",
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters,
      strict: false,
    })),
    tool_choice: responsesToolChoice(attempt.toolChoice),
    parallel_tool_calls: false,
    max_output_tokens: options.maxTokens ?? 4_000,
    // Nothing is kept on OpenAI's side: every turn is a fresh request.
    store: false,
  };
  if (attempt.temperature !== undefined) payload.temperature = attempt.temperature;
  if (attempt.effort) {
    payload.reasoning = {
      effort: openaiEffort(attempt.effort),
      ...(attempt.summary ? { summary: "auto" } : {}),
    };
  }

  // One deadline for the whole exchange, body included (see postWithDeadline).
  const { response, text: raw, latencyMs } = await postWithDeadline(
    OPENAI_RESPONSES_URL,
    {
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    { timeoutMs, signal: options.signal, lang: options.lang },
  );

  if (!response.ok) {
    let detail = raw;
    try {
      const decoded = JSON.parse(raw) as { error?: { message?: string } };
      if (decoded?.error?.message) detail = decoded.error.message;
    } catch {
      // Keep the raw text.
    }
    // Parameter complaints keep their wording so `relax` can read them.
    const message =
      response.status === 400 || response.status === 422
        ? detail || text.rejected(response.status)
        : friendlyUpstreamError(response.status, detail, options.lang);
    throw new OpenRouterError(response.status, message, {
      retryable: response.status === 429 || response.status >= 500,
      retryAfterMs: parseRetryAfter(response.headers),
    });
  }

  try {
    return { data: JSON.parse(raw) as Record<string, unknown>, latencyMs };
  } catch {
    throw new OpenRouterError(response.status, text.notJson, { retryable: true });
  }
}

/**
 * The tool-calling turn through OpenAI's Responses API with the user's own
 * key. Chat Completions refuses function tools together with reasoning on
 * OpenAI's current models, so direct OpenAI calls use this API instead.
 * `options.model` is OpenAI's id.
 */
export async function completeWithOpenAIResponses(
  options: ToolCompletionOptions,
): Promise<ToolCompletion> {
  let attempt: Attempt = {
    toolChoice: options.toolChoice,
    temperature: options.temperature,
    effort: options.includeReasoning ? options.reasoningEffort : undefined,
    summary: true,
  };
  const maxRetries = options.maxRetries ?? 3;
  let retries = 0;
  let relaxations = 0;
  let outcome: Awaited<ReturnType<typeof send>>;

  for (;;) {
    try {
      outcome = await send(options, attempt);
      break;
    } catch (error) {
      if (!(error instanceof OpenRouterError) || error.aborted) throw error;
      const relaxed = relax(attempt, error);
      if (relaxed && relaxations < 4) {
        attempt = relaxed;
        relaxations += 1;
        continue;
      }
      if (!error.retryable || retries >= maxRetries) {
        throw new OpenRouterError(
          error.status,
          error.status === 400 || error.status === 422
            ? friendlyUpstreamError(error.status, error.message, options.lang)
            : error.message,
          { retryable: false },
        );
      }
      const wait = Math.min(
        BACKOFF_MAX_MS,
        (error.retryAfterMs ?? BACKOFF_BASE_MS * 2 ** retries) + Math.random() * 500,
      );
      retries += 1;
      await sleepWithSignal(wait, options.signal, gameText(options.lang).upstream.cancelled);
    }
  }

  const { data, latencyMs } = outcome;
  const toolCalls: ToolCompletion["toolCalls"] = [];
  let content = "";
  let reasoning = "";
  for (const raw of Array.isArray(data.output) ? data.output : []) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    if (item.type === "function_call" && typeof item.name === "string") {
      toolCalls.push({
        name: item.name,
        argumentsRaw:
          typeof item.arguments === "string" ? item.arguments : JSON.stringify(item.arguments ?? {}),
      });
    } else if (item.type === "message" && Array.isArray(item.content)) {
      for (const part of item.content as Array<Record<string, unknown>>) {
        if (typeof part?.text === "string") content += part.text;
      }
    } else if (item.type === "reasoning" && Array.isArray(item.summary)) {
      for (const part of item.summary as Array<Record<string, unknown>>) {
        if (typeof part?.text === "string") reasoning += (reasoning ? "\n\n" : "") + part.text;
      }
    }
  }

  const usage = (data.usage ?? {}) as Record<string, unknown>;
  const promptTokens = Number(usage.input_tokens) || 0;
  const completionTokens = Number(usage.output_tokens) || 0;
  const cachedTokens = Number(
    (usage.input_tokens_details as Record<string, unknown> | undefined)?.cached_tokens,
  );
  const reasoningTokens = Number(
    (usage.output_tokens_details as Record<string, unknown> | undefined)?.reasoning_tokens,
  );
  const incomplete = (data.incomplete_details ?? null) as { reason?: string } | null;

  return {
    toolCalls,
    content,
    reasoning,
    usage:
      promptTokens || completionTokens
        ? {
            promptTokens,
            completionTokens,
            totalTokens: Number(usage.total_tokens) || promptTokens + completionTokens,
            // No cost in the response: the agent layer estimates it from catalog prices.
            ...(reasoningTokens > 0 ? { reasoningTokens } : {}),
            ...(cachedTokens > 0 ? { cachedTokens } : {}),
          }
        : undefined,
    latencyMs,
    // The agent layer retries "length" with more room, as with OpenRouter.
    finishReason:
      data.status === "incomplete" && incomplete?.reason === "max_output_tokens"
        ? "length"
        : typeof data.status === "string"
          ? data.status
          : undefined,
    toolChoiceFallback: attempt.toolChoice !== options.toolChoice,
    provider: OPENAI_PROVIDER_NAME,
    retries,
  };
}
