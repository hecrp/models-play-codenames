/**
 * Very cheap OpenRouter models that support tool calling. They are examples,
 * not a whitelist: the seat picker uses the live catalog.
 */
export interface CodenamesModelPreset {
  id: string;
  label: string;
  note: string;
}

export const CODENAMES_EXAMPLE_MODELS: CodenamesModelPreset[] = [
  {
    id: "openai/gpt-oss-20b",
    label: "GPT-OSS 20B",
    note: "≈ $0.02 / $0.09 · 1M tokens",
  },
  {
    id: "meta-llama/llama-3.1-8b-instruct",
    label: "Llama 3.1 8B",
    note: "≈ $0.02 / $0.04 · 1M tokens",
  },
  {
    id: "inclusionai/ling-3.0-flash",
    label: "Ling 3.0 Flash",
    note: "≈ $0.02 / $0.06 · 1M tokens",
  },
  {
    id: "z-ai/glm-5.3-flash:batch",
    label: "GLM 5.3 Flash",
    note: "≈ $0.02 / $0.07 · 1M tokens",
  },
];

export const DEFAULT_CODENAMES_MODEL_ID = "openai/gpt-oss-20b";
