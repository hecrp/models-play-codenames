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
  supportedParameters: string[];
  inputModalities: string[];
  created: number;
}

export interface ModelsResponse {
  models: ModelInfo[];
  source: "openrouter" | "fallback";
  hasServerKey: boolean;
  fetchedAt: number;
  warning?: string;
}
