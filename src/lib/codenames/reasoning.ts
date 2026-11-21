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
 * Output budget (max_tokens) per effort. On OpenRouter the effort is a share
 * of max_tokens (low ≈ 20%, medium ≈ 50%, high ≈ 80%) and reasoning counts
 * against the same budget, so higher effort needs a bigger total to still
 * leave room for the tool call. Tokens are only billed when used.
 */
const OUTPUT_BUDGET: Record<ReasoningEffort, number> = {
  none: 1500,
  minimal: 3000,
  low: 4000,
  medium: 8000,
  high: 12000,
  xhigh: 16000,
  max: 24000,
};

/** Budget for models that do not reason: a move plus table talk is ~600 tokens. */
const PLAIN_BUDGET = 1500;

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

/** max_tokens for a call, capped by the model's own output limit. */
export function outputBudget(
  model: ModelInfo | undefined,
  effort: ReasoningEffort | undefined,
): number {
  const budget = effort ? OUTPUT_BUDGET[effort] : PLAIN_BUDGET;
  const limit = model?.maxOutputTokens;
  return limit && limit > 0 ? Math.min(budget, limit) : budget;
}
