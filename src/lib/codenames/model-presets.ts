import type { ModelInfo } from "@/lib/types";
import type { Language, Seat } from "./types";

/**
 * Popular, cheap OpenRouter models that support tool calling. They are
 * examples, not a whitelist: the seat picker uses the live catalog.
 *
 * Picked from OpenRouter's weekly usage rankings (November 2026), keeping only
 * models whose estimated long game (~80 calls) stays under $0.05. `:batch`
 * variants are left out (deferred processing) and so are `:free` ones (rate
 * limits stall a game).
 */
export interface CodenamesModelPreset {
  id: string;
  label: string;
  /** Typical completion tokens per move, including reasoning. */
  outputTokens: number;
  note: string;
}

export const CODENAMES_EXAMPLE_MODELS: CodenamesModelPreset[] = [
  {
    id: "deepseek/deepseek-v4.1-flash-1017",
    label: "DeepSeek V4.1 Flash",
    outputTokens: 1060,
    note: "$0.04 / $0.50 · 1M tokens · reasoning",
  },
  {
    id: "tencent/hy4-flash",
    label: "Hy4 Flash",
    outputTokens: 1000,
    note: "$0.04 / $0.14 · 1M tokens · reasoning",
  },
  {
    id: "z-ai/glm-5.3-flash",
    label: "GLM 5.3 Flash",
    outputTokens: 1000,
    note: "$0.04 / $0.08 · 1M tokens · reasoning",
  },
  {
    id: "openai/gpt-6-luna",
    label: "GPT-6 Luna",
    outputTokens: 105,
    note: "$0.10 / $0.50 · 1M tokens",
  },
  {
    id: "anthropic/claude-haiku-5.5",
    label: "Claude Haiku 5.5",
    outputTokens: 250,
    note: "$0.10 / $0.50 · 1M tokens",
  },
  {
    id: "google/gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash Lite",
    outputTokens: 440,
    note: "$0.10 / $0.40 · 1M tokens",
  },
  {
    id: "openai/gpt-oss-20b",
    label: "GPT-OSS 20B",
    outputTokens: 300,
    note: "$0.02 / $0.09 · 1M tokens · cheapest",
  },
];

export const DEFAULT_CODENAMES_MODEL_ID = "openai/gpt-oss-20b";

/**
 * Ready-made seat layouts. "vs" pits one model per team; "cross" swaps roles
 * between two models so each one plays spymaster in one team and operative in
 * the other.
 */
export interface CodenamesMatchup {
  id: string;
  label: Record<Language, string>;
  seats: Record<Seat, string>;
}

const DEEPSEEK = "deepseek/deepseek-v4.1-flash-1017";
const LUNA = "openai/gpt-6-luna";
const HY4 = "tencent/hy4-flash";
const GLM = "z-ai/glm-5.3-flash";
const HAIKU = "anthropic/claude-haiku-5.5";
const GEMINI = "google/gemini-2.5-flash-lite";
const OSS = "openai/gpt-oss-20b";

function versus(red: string, blue: string): Record<Seat, string> {
  return { red_spymaster: red, red_operative: red, blue_spymaster: blue, blue_operative: blue };
}

function cross(a: string, b: string): Record<Seat, string> {
  return { red_spymaster: a, red_operative: b, blue_spymaster: b, blue_operative: a };
}

export const CODENAMES_MATCHUPS: CodenamesMatchup[] = [
  {
    id: "deepseek-luna-cross",
    label: { es: "DeepSeek ⇄ GPT-6 Luna", en: "DeepSeek ⇄ GPT-6 Luna" },
    seats: cross(DEEPSEEK, LUNA),
  },
  {
    id: "deepseek-vs-luna",
    label: { es: "DeepSeek vs GPT-6 Luna", en: "DeepSeek vs GPT-6 Luna" },
    seats: versus(DEEPSEEK, LUNA),
  },
  {
    id: "hy4-vs-glm",
    label: { es: "Hy4 Flash vs GLM 5.3 Flash", en: "Hy4 Flash vs GLM 5.3 Flash" },
    seats: versus(HY4, GLM),
  },
  {
    id: "haiku-gemini-cross",
    label: { es: "Haiku ⇄ Gemini Flash Lite", en: "Haiku ⇄ Gemini Flash Lite" },
    seats: cross(HAIKU, GEMINI),
  },
  {
    id: "four-labs",
    label: { es: "Cuatro laboratorios", en: "Four labs" },
    seats: {
      red_spymaster: DEEPSEEK,
      red_operative: LUNA,
      blue_spymaster: HAIKU,
      blue_operative: GEMINI,
    },
  },
  {
    id: "budget",
    label: { es: "Mínimo coste (GPT-OSS 20B)", en: "Lowest cost (GPT-OSS 20B)" },
    seats: versus(OSS, OSS),
  },
];

/** Calls in a typical finished game (10-13 turns) and prompt size per call. */
export const TYPICAL_GAME_CALLS = 35;
const PROMPT_TOKENS_PER_CALL = 2000;
const DEFAULT_OUTPUT_TOKENS = 600;

/**
 * Rough cost of a typical game from live catalog prices. Returns null when a
 * seat's model is missing from the catalog or has no price.
 */
export function estimateGameCostUsd(
  seatModels: Record<Seat, string>,
  catalog: readonly ModelInfo[],
): number | null {
  let total = 0;
  for (const modelId of Object.values(seatModels)) {
    const model = catalog.find((candidate) => candidate.id === modelId);
    if (!model || model.pricing.prompt < 0 || model.pricing.completion < 0) return null;
    const output =
      CODENAMES_EXAMPLE_MODELS.find((preset) => preset.id === modelId)?.outputTokens ??
      DEFAULT_OUTPUT_TOKENS;
    const perCall =
      PROMPT_TOKENS_PER_CALL * model.pricing.prompt + output * model.pricing.completion;
    total += perCall * (TYPICAL_GAME_CALLS / 4);
  }
  return total;
}
