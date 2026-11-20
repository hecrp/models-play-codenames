import type { ModelInfo } from "./types";

/** Curated ids shown first in the picker (missing ones are filtered out). */
export const FEATURED_MODEL_IDS = [
  "openai/gpt-5-mini",
  "anthropic/claude-sonnet-5.5",
  "google/gemini-4-neon",
  "openai/gpt-6.2-sol",
  "deepseek/deepseek-v4.1-flash",
  "qwen/qwen4-max",
  "x-ai/grok-4.7",
  "tencent/hy4-flash",
  "openrouter/auto",
];

export const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  "meta-llama": "Meta",
  deepseek: "DeepSeek",
  mistralai: "Mistral AI",
  "x-ai": "SpaceXAI",
  qwen: "Qwen",
  "qwen3": "Qwen",
  cohere: "Cohere",
  nvidia: "NVIDIA",
  microsoft: "Microsoft",
  amazon: "Amazon",
  moonshotai: "Moonshot AI",
  "z-ai": "Z.ai",
  minimax: "MiniMax",
  perplexity: "Perplexity",
  openrouter: "OpenRouter",
  tencent: "Tencent",
  nousresearch: "Nous Research",
  "cognitivecomputations": "Cognitive Computations",
  "the-drummer": "The Drummer",
  "liquid": "Liquid AI",
  "ai21": "AI21",
  "bytedance": "ByteDance",
  "baidu": "Baidu",
  "stepfun": "StepFun",
  "inclusionai": "InclusionAI",
};

export function providerOf(modelId: string): string {
  return modelId.includes("/") ? modelId.split("/")[0] : modelId;
}

export function providerLabel(modelId: string): string {
  const provider = providerOf(modelId);
  return (
    PROVIDER_LABELS[provider] ??
    provider.charAt(0).toUpperCase() + provider.slice(1)
  );
}

/** "Anthropic: Claude Sonnet 4.5" -> "Claude Sonnet 4.5" */
export function modelDisplayName(name: string): string {
  const separator = name.indexOf(": ");
  return separator >= 0 ? name.slice(separator + 2) : name;
}

export function supportsParameter(
  model: ModelInfo | undefined,
  parameter: string,
): boolean {
  if (!model) return true;
  if (model.supportedParameters.length === 0) return true;
  return model.supportedParameters.includes(parameter);
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function normalizeModel(raw: unknown): ModelInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const model = raw as Record<string, unknown>;
  const id = typeof model.id === "string" ? model.id : "";
  if (!id) return null;

  const architecture =
    model.architecture && typeof model.architecture === "object"
      ? (model.architecture as Record<string, unknown>)
      : {};
  const pricing =
    model.pricing && typeof model.pricing === "object"
      ? (model.pricing as Record<string, unknown>)
      : {};
  const topProvider =
    model.top_provider && typeof model.top_provider === "object"
      ? (model.top_provider as Record<string, unknown>)
      : {};

  const supportedParameters = toStringArray(model.supported_parameters);
  const inputModalities = toStringArray(architecture.input_modalities);
  const outputModalities = toStringArray(architecture.output_modalities);

  if (
    outputModalities.length > 0 &&
    !outputModalities.includes("text")
  ) {
    return null;
  }
  if (/embed|moderation/i.test(id)) return null;

  const description =
    typeof model.description === "string" ? model.description.slice(0, 380) : "";

  return {
    id,
    name:
      typeof model.name === "string" && model.name.trim()
        ? model.name.trim()
        : id,
    provider: providerLabel(id),
    description,
    contextLength:
      toNumber(model.context_length) ||
      toNumber(topProvider.context_length) ||
      0,
    maxOutputTokens:
      toNumber(topProvider.max_completion_tokens) || undefined,
    pricing: {
      prompt: toNumber(pricing.prompt),
      completion: toNumber(pricing.completion),
    },
    supportsReasoning:
      supportedParameters.includes("reasoning") ||
      supportedParameters.includes("include_reasoning"),
    supportedParameters,
    inputModalities:
      inputModalities.length > 0 ? inputModalities : ["text"],
    created: toNumber(model.created),
  };
}

export function normalizeModels(payload: unknown): ModelInfo[] {
  if (!payload || typeof payload !== "object") return [];
  const data = (payload as Record<string, unknown>).data;
  if (!Array.isArray(data)) return [];

  return data
    .map(normalizeModel)
    .filter((model): model is ModelInfo => model !== null)
    .sort((a, b) => b.created - a.created);
}

/**
 * Static catalog used when OpenRouter is unreachable (offline dev, rate limit).
 * Prices are USD per token, matching OpenRouter's shape.
 */
export const FALLBACK_MODELS: ModelInfo[] = [
  {
    id: "openai/gpt-5-mini",
    name: "OpenAI: GPT-5 Mini",
    provider: "OpenAI",
    description:
      "Rápido y económico, con razonamiento configurable y buena calidad general.",
    contextLength: 400_000,
    maxOutputTokens: 128_000,
    pricing: { prompt: 0.00000025, completion: 0.000002 },
    supportsReasoning: true,
    supportedParameters: [
      "include_reasoning",
      "reasoning",
      "reasoning_effort",
      "max_tokens",
      "max_completion_tokens",
      "response_format",
      "tools",
      "tool_choice",
    ],
    inputModalities: ["text", "image", "file"],
    created: 1_754_587_407,
  },
  {
    id: "anthropic/claude-sonnet-5.5",
    name: "Anthropic: Claude Sonnet 5.5",
    provider: "Anthropic",
    description:
      "Excelente para código, escritura y tareas agénticas con contexto de 1M.",
    contextLength: 1_000_000,
    maxOutputTokens: 128_000,
    pricing: { prompt: 0.000002, completion: 0.00001 },
    supportsReasoning: true,
    supportedParameters: [
      "include_reasoning",
      "reasoning",
      "reasoning_effort",
      "max_tokens",
      "max_completion_tokens",
      "response_format",
      "tools",
      "tool_choice",
    ],
    inputModalities: ["text", "image", "file"],
    created: 1_790_618_686,
  },
  {
    id: "google/gemini-4-neon",
    name: "Google: Gemini 4 Neon",
    provider: "Google",
    description:
      "Modelo multimodal rápido y equilibrado, ideal para código y agentes.",
    contextLength: 1_048_576,
    maxOutputTokens: 943_718,
    pricing: { prompt: 0.000003, completion: 0.000015 },
    supportsReasoning: true,
    supportedParameters: [
      "include_reasoning",
      "reasoning",
      "reasoning_effort",
      "max_tokens",
      "temperature",
      "top_p",
      "response_format",
      "tools",
      "tool_choice",
    ],
    inputModalities: ["text", "image", "audio", "video", "file"],
    created: 1_795_006_977,
  },
  {
    id: "openai/gpt-6.2-sol",
    name: "OpenAI: GPT-6.2 Sol",
    provider: "OpenAI",
    description:
      "Versátil y eficiente de la familia GPT-6.2, con razonamiento avanzado.",
    contextLength: 1_050_000,
    maxOutputTokens: 128_000,
    pricing: { prompt: 0.000002, completion: 0.00001 },
    supportsReasoning: true,
    supportedParameters: [
      "include_reasoning",
      "reasoning",
      "reasoning_effort",
      "max_tokens",
      "max_completion_tokens",
      "response_format",
      "verbosity",
      "tools",
      "tool_choice",
    ],
    inputModalities: ["text", "image", "file"],
    created: 1_794_938_371,
  },
  {
    id: "deepseek/deepseek-v4.1-flash",
    name: "DeepSeek: DeepSeek V4.1 Flash",
    provider: "DeepSeek",
    description:
      "MoE abierto muy barato y veloz, con razonamiento y contexto de 1M.",
    contextLength: 1_048_576,
    maxOutputTokens: 943_718,
    pricing: { prompt: 0.0000003, completion: 0.0000012 },
    supportsReasoning: true,
    supportedParameters: [
      "include_reasoning",
      "reasoning",
      "reasoning_effort",
      "max_tokens",
      "temperature",
      "top_p",
      "response_format",
      "tools",
      "tool_choice",
    ],
    inputModalities: ["text", "image"],
    created: 1_789_021_285,
  },
  {
    id: "qwen/qwen4-max",
    name: "Qwen: Qwen4 Max",
    provider: "Qwen",
    description:
      "Buque insignia de Qwen4 con contexto de 1M y entrada de vídeo.",
    contextLength: 1_000_000,
    maxOutputTokens: 131_072,
    pricing: { prompt: 0.000001425, completion: 0.000004275 },
    supportsReasoning: true,
    supportedParameters: [
      "include_reasoning",
      "reasoning",
      "reasoning_effort",
      "max_tokens",
      "temperature",
      "top_p",
      "response_format",
      "tools",
      "tool_choice",
    ],
    inputModalities: ["text", "image", "video"],
    created: 1_794_795_526,
  },
  {
    id: "x-ai/grok-4.7",
    name: "SpaceXAI: Grok 4.7",
    provider: "SpaceXAI",
    description:
      "Flagship de SpaceXAI para código, tareas agénticas y trabajo intensivo.",
    contextLength: 500_000,
    maxOutputTokens: 450_000,
    pricing: { prompt: 0.000002, completion: 0.000006 },
    supportsReasoning: true,
    supportedParameters: [
      "include_reasoning",
      "reasoning",
      "reasoning_effort",
      "max_tokens",
      "temperature",
      "top_p",
      "response_format",
      "tools",
      "tool_choice",
    ],
    inputModalities: ["text", "image", "file"],
    created: 1_790_007_541,
  },
  {
    id: "tencent/hy4-flash",
    name: "Tencent: Hy4 Flash",
    provider: "Tencent",
    description:
      "Variante ligera y ultrabarata de Hy4, con contexto de 1M y razonamiento.",
    contextLength: 1_048_576,
    maxOutputTokens: 65_536,
    pricing: { prompt: 0.000000035, completion: 0.0000001405 },
    supportsReasoning: true,
    supportedParameters: [
      "include_reasoning",
      "reasoning",
      "max_tokens",
      "max_completion_tokens",
      "temperature",
      "response_format",
      "tools",
      "tool_choice",
    ],
    inputModalities: ["text", "image"],
    created: 1_794_838_706,
  },
  {
    id: "anthropic/claude-haiku-5.5",
    name: "Anthropic: Claude Haiku 5.5",
    provider: "Anthropic",
    description:
      "Pequeño y rápido para alto volumen: resúmenes, subagentes y navegación.",
    contextLength: 1_000_000,
    maxOutputTokens: 128_000,
    pricing: { prompt: 0.0000001, completion: 0.0000005 },
    supportsReasoning: true,
    supportedParameters: [
      "include_reasoning",
      "reasoning",
      "reasoning_effort",
      "max_tokens",
      "max_completion_tokens",
      "response_format",
      "tools",
      "tool_choice",
    ],
    inputModalities: ["text", "image", "file"],
    created: 1_791_397_883,
  },
  {
    id: "openrouter/auto",
    name: "OpenRouter: Auto",
    provider: "OpenRouter",
    description:
      "Enruta cada petición al mejor modelo disponible según coste y disponibilidad.",
    contextLength: 2_000_000,
    pricing: { prompt: -1, completion: -1 },
    supportsReasoning: true,
    supportedParameters: [],
    inputModalities: ["text", "image", "audio", "video", "file"],
    created: 1_793_885_889,
  },
];
