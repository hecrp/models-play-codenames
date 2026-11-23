import type { DirectProvider } from "@/lib/codenames/providers";
export interface Usage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost?: number;
  reasoningTokens?: number;
  cachedTokens?: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  description?: string;
  contextLength: number;
  maxOutputTokens?: number;
  pricing: {
    prompt: number;
    completion: number;
  };
  supportsReasoning: boolean;
  /** Reasoning controls from the catalog, when OpenRouter describes them. */
  reasoning?: {
    /** Reasoning cannot be turned off (effort "none" is rejected). */
    mandatory: boolean;
    /** Accepted `reasoning.effort` values; empty when unknown. */
    efforts: string[];
    defaultEffort?: string;
  };
  supportedParameters: string[];
  inputModalities: string[];
  created: number;
}

export interface ModelsResponse {
  models: ModelInfo[];
  source: "openrouter" | "fallback";
  hasServerKey: boolean;
  /** Which provider keys the server environment defines. */
  serverKeys: Record<"openrouter" | DirectProvider, boolean>;
  fetchedAt: number;
  warning?: string;
}
