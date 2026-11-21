import { findModel, supportsToolCalling } from "@/lib/server/model-catalog";
import { completeWithTools, estimateCost, OpenRouterError } from "@/lib/server/openrouter";
import { extractJsonObject, parseToolCall } from "@/lib/codenames/action-parser";
import { gameText } from "@/lib/codenames/messages";
import { buildAgentPrompt, PROMPT_VERSION } from "@/lib/codenames/prompts";
import { lowerEffort, outputBudget, resolveEffort } from "@/lib/codenames/reasoning";
import { roleOfSeat } from "@/lib/codenames/seats";
import { toolChoiceForSeat, toolsForSeat } from "@/lib/codenames/tools";
import type { ModelInfo } from "@/lib/types";
import type {
  AgentAdapter,
  AgentRequest,
  AgentResponse,
  EventMeta,
  GameAction,
  Language,
  OracleErrorCode,
  ReasoningEffort,
  Seat,
} from "@/lib/codenames/types";

export interface OpenRouterAgentOptions {
  apiKey: string;
  models: readonly ModelInfo[];
  timeoutMs?: number;
  /** Fixed output budget; by default it grows with the reasoning effort. */
  maxTokens?: number;
  /** Default effort for seats that do not choose one. */
  reasoningEffort?: ReasoningEffort;
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

type Completion = Awaited<ReturnType<typeof completeWithTools>>;

type Interpretation =
  | { ok: true; action: GameAction; recovered?: EventMeta["recovered"] }
  | { ok: false; code: OracleErrorCode; message: string };

/**
 * Turn a completion into a game action, rescuing the malformed answers seen in
 * real games: the call written as JSON text, identical duplicate calls, and
 * arguments cut off or corrupted mid-JSON.
 */
function interpret(completion: Completion, seat: Seat, lang: Language): Interpretation {
  const text = gameText(lang);
  const isSpymaster = roleOfSeat(seat) === "spymaster";
  let calls = completion.toolCalls;
  let recovered: EventMeta["recovered"];

  if (calls.length === 0) {
    const json = completion.content ? extractJsonObject(completion.content) : null;
    if (!json) {
      return {
        ok: false,
        code: "no_tool_call",
        message:
          text.noToolCall +
          (completion.content ? text.textReceived(completion.content.slice(0, 200)) : ""),
      };
    }
    const name = isSpymaster ? "give_clue" : "word" in json ? "guess" : "stop";
    calls = [{ name, argumentsRaw: JSON.stringify(json) }];
    recovered = "text";
  }

  if (calls.length > 1) {
    const [first] = calls;
    const identical = calls.every(
      (call) => call.name === first.name && call.argumentsRaw === first.argumentsRaw,
    );
    if (!identical) {
      return { ok: false, code: "multiple_tool_calls", message: text.multipleToolCalls };
    }
    calls = [first];
    recovered ??= "deduped";
  }

  const parsed = parseToolCall(calls[0].name, calls[0].argumentsRaw, lang);
  if (!parsed.ok) return parsed;
  if (parsed.salvaged) recovered ??= "salvaged";

  if (isSpymaster && parsed.action.type !== "give_clue") {
    return { ok: false, code: "invalid_action", message: text.spymasterMustClue };
  }
  if (!isSpymaster && parsed.action.type === "give_clue") {
    return { ok: false, code: "invalid_action", message: text.operativeMustGuess };
  }
  return { ok: true, action: parsed.action, ...(recovered ? { recovered } : {}) };
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

      // The seat's own choice wins over the adapter default; both adapt to
      // what the model accepts. Undefined for models that do not reason.
      const effort = resolveEffort(
        model,
        request.config.reasoningEffort ?? options.reasoningEffort,
      );
      // Models reasoning natively skip the reasoning argument and its prompt note.
      const reasoningField = effort === undefined || effort === "none";
      const { system, user } = buildAgentPrompt(
        request.seat,
        request.view,
        request.feedback,
        { reasoningField },
      );
      const tools = toolsForSeat(request.seat, request.view, { reasoningField });
      const supportsTemperature =
        !model ||
        model.supportedParameters.length === 0 ||
        model.supportedParameters.includes("temperature");

      const call = (callEffort: ReasoningEffort | undefined, maxTokens: number) =>
        completeWithTools({
          apiKey: options.apiKey,
          model: request.config.modelId,
          systemPrompt: system,
          userPrompt: user,
          tools,
          toolChoice: toolChoiceForSeat(request.seat),
          temperature: supportsTemperature ? request.config.temperature : undefined,
          maxTokens,
          timeoutMs: options.timeoutMs ?? 60_000,
          includeReasoning: callEffort !== undefined,
          reasoningEffort: callEffort,
          provider: options.provider,
          signal: request.signal,
          lang,
        });

      const failure = (caught: unknown, cost?: number): AgentResponse => {
        const meta: EventMeta = {
          modelId: model?.id,
          promptVersion: PROMPT_VERSION,
          ...(cost ? { costUsd: cost } : {}),
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
            message: caught instanceof Error ? caught.message : text.unknownModelError,
            fatal: true,
          },
          meta,
        };
      };

      let usedEffort = effort;
      let maxTokens = options.maxTokens ?? outputBudget(model, effort);
      let completion: Completion;
      try {
        completion = await call(usedEffort, maxTokens);
      } catch (caught) {
        return failure(caught);
      }
      let result = interpret(completion, request.seat, lang);

      // Ran out of tokens before a usable move (usually reasoning ate the
      // budget): retry once with less reasoning and more room, instead of
      // spending one of the seat's three attempts on a technical failure.
      let lengthRetry = false;
      let earlierCost = 0;
      if (!result.ok && completion.finishReason === "length") {
        earlierCost = metaFromCompletion(completion, model, PROMPT_VERSION).costUsd ?? 0;
        usedEffort = usedEffort ? (lowerEffort(model, usedEffort) ?? usedEffort) : undefined;
        const limit = model?.maxOutputTokens;
        maxTokens = Math.round(maxTokens * 1.5);
        if (limit && limit > 0) maxTokens = Math.min(maxTokens, limit);
        try {
          completion = await call(usedEffort, maxTokens);
        } catch (caught) {
          return failure(caught, earlierCost);
        }
        result = interpret(completion, request.seat, lang);
        lengthRetry = true;
      }

      const base = metaFromCompletion(completion, model, PROMPT_VERSION);
      const meta: EventMeta = {
        ...base,
        ...(earlierCost ? { costUsd: (base.costUsd ?? 0) + earlierCost } : {}),
        ...(usedEffort ? { reasoningEffort: usedEffort } : {}),
        maxTokens,
        ...(lengthRetry ? { lengthRetry } : {}),
        ...(result.ok && result.recovered ? { recovered: result.recovered } : {}),
      };

      if (!result.ok) {
        return {
          action: null,
          error: { code: result.code, message: result.message, fatal: false },
          meta,
        };
      }
      return { action: result.action, error: undefined, meta };
    },
  };
}
