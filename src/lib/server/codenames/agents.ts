import { findModel, supportsToolCalling } from "@/lib/server/model-catalog";
import { completeWithTools, estimateCost, OpenRouterError } from "@/lib/server/openrouter";
import { parseToolCall } from "@/lib/codenames/action-parser";
import { gameText } from "@/lib/codenames/messages";
import { buildAgentPrompt, PROMPT_VERSION } from "@/lib/codenames/prompts";
import { roleOfSeat } from "@/lib/codenames/seats";
import { toolChoiceForSeat, toolsForSeat } from "@/lib/codenames/tools";
import type { ModelInfo } from "@/lib/types";
import type {
  AgentAdapter,
  AgentRequest,
  AgentResponse,
  EventMeta,
} from "@/lib/codenames/types";

export interface OpenRouterAgentOptions {
  apiKey: string;
  models: readonly ModelInfo[];
  timeoutMs?: number;
  maxTokens?: number;
  reasoningEffort?: "low" | "medium" | "high";
  /** OpenRouter provider routing (e.g. pin a provider for reproducible studies). */
  provider?: Record<string, unknown>;
}

function metaFromCompletion(
  completion: Awaited<ReturnType<typeof completeWithTools>>,
  model: ModelInfo | undefined,
  promptVersion: string,
): EventMeta {
  const usage = completion.usage;
  const estimated = usage?.cost === undefined ? estimateCost(usage, model) : undefined;
  return {
    modelId: model?.id,
    promptVersion,
    reasoning: completion.reasoning ? completion.reasoning.slice(0, 4_000) : undefined,
    rawResponse: JSON.stringify({
      toolCalls: completion.toolCalls,
      content: completion.content.slice(0, 2_000),
      finishReason: completion.finishReason,
      toolChoiceFallback: completion.toolChoiceFallback,
    }).slice(0, 8_000),
    promptTokens: usage?.promptTokens,
    completionTokens: usage?.completionTokens,
    costUsd: usage?.cost ?? estimated,
    costEstimated: usage?.cost === undefined && estimated !== undefined,
    latencyMs: completion.latencyMs,
    ...(completion.provider ? { provider: completion.provider } : {}),
    ...(usage?.reasoningTokens ? { reasoningTokens: usage.reasoningTokens } : {}),
    ...(usage?.cachedTokens ? { cachedTokens: usage.cachedTokens } : {}),
    ...(completion.finishReason ? { finishReason: completion.finishReason } : {}),
    ...(completion.retries ? { retries: completion.retries } : {}),
  };
}

export function createOpenRouterAgentAdapter(
  options: OpenRouterAgentOptions,
): AgentAdapter {
  return {
    async request(request: AgentRequest): Promise<AgentResponse> {
      const lang = request.view.lang;
      const text = gameText(lang);
      const model = findModel(options.models, request.config.modelId);
      if (model && !supportsToolCalling(model)) {
        return {
          action: null,
          error: {
            code: "invalid_action",
            message: text.noToolCalling(model.name),
            fatal: true,
          },
          meta: { modelId: model.id, promptVersion: PROMPT_VERSION },
        };
      }

      const { system, user } = buildAgentPrompt(
        request.seat,
        request.view,
        request.feedback,
      );
      const supportsTemperature =
        !model ||
        model.supportedParameters.length === 0 ||
        model.supportedParameters.includes("temperature");

      let completion: Awaited<ReturnType<typeof completeWithTools>>;
      try {
        completion = await completeWithTools({
          apiKey: options.apiKey,
          model: request.config.modelId,
          systemPrompt: system,
          userPrompt: user,
          tools: toolsForSeat(request.seat, request.view),
          toolChoice: toolChoiceForSeat(request.seat),
          temperature: supportsTemperature
            ? request.config.temperature
            : undefined,
          maxTokens: options.maxTokens ?? 2000,
          timeoutMs: options.timeoutMs ?? 60_000,
          includeReasoning: model?.supportsReasoning ?? false,
          reasoningEffort: options.reasoningEffort ?? "low",
          provider: options.provider,
          signal: request.signal,
          lang,
        });
      } catch (caught) {
        const meta: EventMeta = {
          modelId: model?.id,
          promptVersion: PROMPT_VERSION,
        };
        if (caught instanceof OpenRouterError) {
          if (caught.aborted) {
            return {
              action: null,
              error: {
                code: "timeout",
                message: text.callCancelled,
                fatal: true,
                aborted: true,
              },
              meta,
            };
          }
          // Rate limits and provider outages already went through backoff:
          // pause the game instead of burning the seat's attempts.
          const isTimeout = caught.status === 0 && !caught.retryable;
          return {
            action: null,
            error: {
              code: isTimeout ? "timeout" : "invalid_action",
              message: caught.message,
              fatal: !isTimeout,
              transient: true,
            },
            meta,
          };
        }
        return {
          action: null,
          error: {
            code: "invalid_action",
            message:
              caught instanceof Error
                ? caught.message
                : text.unknownModelError,
            fatal: true,
          },
          meta,
        };
      }

      const meta = metaFromCompletion(completion, model, PROMPT_VERSION);

      if (completion.toolCalls.length === 0) {
        return {
          action: null,
          error: {
            code: "no_tool_call",
            message:
              text.noToolCall +
              (completion.content
                ? text.textReceived(completion.content.slice(0, 200))
                : ""),
            fatal: false,
          },
          meta,
        };
      }

      if (completion.toolCalls.length > 1) {
        return {
          action: null,
          error: {
            code: "multiple_tool_calls",
            message: text.multipleToolCalls,
            fatal: false,
          },
          meta,
        };
      }

      const call = completion.toolCalls[0];
      const parsed = parseToolCall(call.name, call.argumentsRaw, lang);
      if (!parsed.ok) {
        return {
          action: null,
          error: {
            code: parsed.code,
            message: parsed.message,
            fatal: false,
          },
          meta,
        };
      }

      const isSpymaster = roleOfSeat(request.seat) === "spymaster";
      if (isSpymaster && parsed.action.type !== "give_clue") {
        return {
          action: null,
          error: {
            code: "invalid_action",
            message: text.spymasterMustClue,
            fatal: false,
          },
          meta,
        };
      }
      if (!isSpymaster && parsed.action.type === "give_clue") {
        return {
          action: null,
          error: {
            code: "invalid_action",
            message: text.operativeMustGuess,
            fatal: false,
          },
          meta,
        };
      }

      return { action: parsed.action, error: undefined, meta };
    },
  };
}
