import type { ModelInfo } from "@/lib/types";
import type { ReasoningEffort } from "./types";

/** OpenRouter `reasoning.effort` levels, lowest first. */
export const REASONING_EFFORTS: readonly ReasoningEffort[] = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

/**
 * Low effort is enough for Codenames: the moves are short and higher levels
 * mostly add latency and cost.
 */
export const DEFAULT_REASONING_EFFORT: ReasoningEffort = "low";

/** Levels offered when the catalog says a model reasons but not how. */
const UNKNOWN_EFFORTS: readonly ReasoningEffort[] = ["low", "medium", "high"];

/**
 * Output budget (max_tokens) of a call's first attempt, the same for every
 * model and effort, capped by the model's own output limit. Reasoning counts
 * against it and calls pay only for what they use, so it is a ceiling: with
 * the old 12,000 at low effort, HY4 Flash ran out in 8% of its calls (26 of
 * 312 in the v13 pilot) and each one had to be repeated with twice the room.
 *
 * Caveat: for some providers OpenRouter turns the effort into a share of
 * max_tokens (low ≈ 20%, medium ≈ 50%, high ≈ 80%), so a bigger ceiling can
 * also mean a bigger reasoning budget for those models.
 */
export const FIRST_ATTEMPT_BUDGET = 32_000;

/**
 * Per-call timeout, for the whole call (headers and body). Long reasoning on a
 * slow provider must not fail a move: in the pilots and the screen (~5,000
 * calls) no model but Qwen 3.8 Flash took longer than 265 s, so 300 s only
 * cuts calls that are effectively stuck.
 */
export const MODEL_CALL_TIMEOUT_MS = 300_000;

export function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return typeof value === "string" && (REASONING_EFFORTS as readonly string[]).includes(value);
}

function rank(effort: ReasoningEffort): number {
  return REASONING_EFFORTS.indexOf(effort);
}

/**
 * Efforts a model accepts, lowest first. Empty for models that do not reason.
 * "none" is never offered when reasoning is mandatory.
 */
export function effortOptions(model: ModelInfo | undefined): ReasoningEffort[] {
  if (!model?.supportsReasoning) return [];
  const listed = (model.reasoning?.efforts ?? []).filter(isReasoningEffort);
  const efforts = listed.length > 0 ? listed : [...UNKNOWN_EFFORTS];
  return efforts
    .filter((effort) => !(effort === "none" && model.reasoning?.mandatory))
    .sort((a, b) => rank(a) - rank(b));
}

/**
 * The effort actually sent for a seat: the requested one (or the default) if
 * the model accepts it, otherwise the closest accepted level, preferring the
 * lower one on a tie. Undefined for models that do not reason.
 */
export function resolveEffort(
  model: ModelInfo | undefined,
  requested?: ReasoningEffort,
): ReasoningEffort | undefined {
  const options = effortOptions(model);
  if (options.length === 0) return undefined;
  const target = requested ?? DEFAULT_REASONING_EFFORT;
  if (options.includes(target)) return target;
  return options.reduce((best, option) => {
    const distance = Math.abs(rank(option) - rank(target));
    const bestDistance = Math.abs(rank(best) - rank(target));
    return distance < bestDistance ? option : best;
  });
}

/** The next accepted level below `effort`, used to retry a truncated answer. */
export function lowerEffort(
  model: ModelInfo | undefined,
  effort: ReasoningEffort,
): ReasoningEffort | undefined {
  const lower = effortOptions(model).filter((option) => rank(option) < rank(effort));
  return lower[lower.length - 1];
}

/** A token budget capped by the model's own output limit (when the catalog gives one). */
export function capToModel(model: ModelInfo | undefined, tokens: number): number {
  const limit = model?.maxOutputTokens;
  return limit && limit > 0 ? Math.min(tokens, limit) : tokens;
}

/**
 * max_tokens for a call's first attempt: FIRST_ATTEMPT_BUDGET for every model
 * and effort, capped by the model's output limit. `_effort` is kept so callers
 * do not change if the budget ever depends on it again.
 */
export function outputBudget(
  model: ModelInfo | undefined,
  _effort?: ReasoningEffort,
): number {
  return capToModel(model, FIRST_ATTEMPT_BUDGET);
}
