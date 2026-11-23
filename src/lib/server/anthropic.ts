import Anthropic from "@anthropic-ai/sdk";
import { gameText } from "@/lib/codenames/messages";
import type { ReasoningEffort } from "@/lib/codenames/types";
import {
  friendlyUpstreamError,
  OpenRouterError,
  type ToolCompletion,
  type ToolCompletionOptions,
} from "./openrouter";

/** Name stored as the serving provider of a direct Anthropic call. */
export const ANTHROPIC_PROVIDER_NAME = "Anthropic API";

/**
 * The SDK refuses non-streaming requests whose max_tokens could take over ten
 * minutes (about 21,333 tokens). A move is a few hundred tokens plus thinking,
 * so this only trims the most generous reasoning budgets.
 */
const MAX_OUTPUT_TOKENS = 21_000;

type AnthropicEffort = "low" | "medium" | "high" | "xhigh" | "max";

/**
 * Current Claude models cannot switch thinking off (Opus 5.5) or only do so in
 * special modes, so "none" and "minimal" map to the lowest effort.
 */
function anthropicEffort(effort: ReasoningEffort): AnthropicEffort {
  return effort === "none" || effort === "minimal" ? "low" : effort;
}

/** A 400 that points at the thinking or effort settings: retry without them. */
function isThinkingRejection(error: unknown): boolean {
  return (
    error instanceof Anthropic.BadRequestError &&
    /thinking|effort|output_config|adaptive|display/i.test(error.message)
  );
}

function toUpstreamError(error: unknown, options: ToolCompletionOptions): OpenRouterError {
  const text = gameText(options.lang).upstream;
  if (error instanceof Anthropic.APIUserAbortError) {
    return new OpenRouterError(0, text.cancelled, { aborted: true });
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    const seconds = Math.round((options.timeoutMs ?? 60_000) / 1000);
    return new OpenRouterError(0, text.timeout(seconds), { retryable: false });
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new OpenRouterError(0, `${text.unreachable} ${error.message}`, { retryable: false });
  }
  if (error instanceof Anthropic.APIError) {
    const status = error.status ?? 0;
    const detail =
      (error.error as { error?: { message?: string } } | undefined)?.error?.message ??
      error.message;
    // The SDK already retried 429/5xx with backoff: do not retry again.
    return new OpenRouterError(status, friendlyUpstreamError(status, detail, options.lang), {
      retryable: false,
    });
  }
  return new OpenRouterError(0, error instanceof Error ? error.message : String(error), {
    retryable: false,
  });
}

/**
 * The same tool-calling turn as `completeWithTools`, sent to the Anthropic
 * Messages API with the user's own key. `options.model` is Anthropic's id.
 *
 * Forced tool choice is rejected by current Claude models (and by any model
 * while thinking), so the call uses `auto` with parallel calls disabled; the
 * prompts already demand exactly one tool call and the agent layer rescues a
 * move written as text. Sampling parameters are left out: the current API
 * version rejects them.
 */
export async function completeWithAnthropic(
  options: ToolCompletionOptions,
): Promise<ToolCompletion> {
  const client = new Anthropic({
    apiKey: options.apiKey,
    maxRetries: options.maxRetries ?? 3,
    timeout: options.timeoutMs ?? 60_000,
  });

  const tools: Anthropic.Tool[] = options.tools.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
    input_schema: tool.function.parameters as Anthropic.Tool.InputSchema,
  }));

  const effort =
    options.includeReasoning && options.reasoningEffort
      ? anthropicEffort(options.reasoningEffort)
      : undefined;
  const base: Anthropic.MessageCreateParamsNonStreaming = {
    model: options.model,
    max_tokens: Math.min(options.maxTokens ?? 4_000, MAX_OUTPUT_TOKENS),
    system: options.systemPrompt,
    messages: [{ role: "user", content: options.userPrompt }],
    tools,
    tool_choice: { type: "auto", disable_parallel_tool_use: true },
  };
  const withThinking: Anthropic.MessageCreateParamsNonStreaming = effort
    ? {
        ...base,
        // Summarized thinking feeds the reasoning popup in the chat.
        thinking: { type: "adaptive", display: "summarized" },
        output_config: { effort },
      }
    : base;

  const started = performance.now();
  let message: Anthropic.Message;
  try {
    try {
      message = await client.messages.create(withThinking, { signal: options.signal });
    } catch (error) {
      // Older Claude models take neither adaptive thinking nor effort.
      if (!effort || !isThinkingRejection(error)) throw error;
      message = await client.messages.create(base, { signal: options.signal });
    }
  } catch (error) {
    throw toUpstreamError(error, options);
  }
  const latencyMs = Math.round(performance.now() - started);

  const toolCalls: ToolCompletion["toolCalls"] = [];
  let content = "";
  let reasoning = "";
  for (const block of message.content) {
    if (block.type === "tool_use") {
      toolCalls.push({ name: block.name, argumentsRaw: JSON.stringify(block.input ?? {}) });
    } else if (block.type === "text") {
      content += block.text;
    } else if (block.type === "thinking") {
      reasoning += block.thinking;
    }
  }

  const usage = message.usage;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const promptTokens = usage.input_tokens + cacheRead + (usage.cache_creation_input_tokens ?? 0);
  const thinkingTokens = usage.output_tokens_details?.thinking_tokens ?? 0;

  return {
    toolCalls,
    content,
    reasoning,
    usage: {
      promptTokens,
      completionTokens: usage.output_tokens,
      totalTokens: promptTokens + usage.output_tokens,
      // No cost in the response: the agent layer estimates it from the catalog prices.
      ...(thinkingTokens > 0 ? { reasoningTokens: thinkingTokens } : {}),
      ...(cacheRead > 0 ? { cachedTokens: cacheRead } : {}),
    },
    latencyMs,
    // The agent layer retries "length" with more room, as with OpenRouter.
    finishReason:
      message.stop_reason === "max_tokens" ? "length" : (message.stop_reason ?? undefined),
    toolChoiceFallback: false,
    provider: ANTHROPIC_PROVIDER_NAME,
    retries: 0,
  };
}
