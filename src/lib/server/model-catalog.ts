import { FALLBACK_MODELS, normalizeModels } from "@/lib/models";
import type { ModelInfo } from "@/lib/types";

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const CACHE_TTL_MS = 10 * 60 * 1000;
const FALLBACK_TTL_MS = 60 * 1000;

export interface ModelCatalog {
  models: ModelInfo[];
  source: "openrouter" | "fallback";
  fetchedAt: number;
  warning?: string;
}

let cache: ModelCatalog | null = null;

async function fetchCatalog(): Promise<ModelCatalog> {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  const response = await fetch(OPENROUTER_MODELS_URL, {
    headers: {
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
      "HTTP-Referer":
        process.env.OPENROUTER_SITE_URL ?? "http://localhost:3000",
      "X-Title": process.env.OPENROUTER_SITE_NAME ?? "Models play Codenames",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter responded ${response.status}`);
  }

  const payload: unknown = await response.json();
  const models = normalizeModels(payload);
  if (models.length === 0) {
    throw new Error("The OpenRouter catalog came back empty");
  }

  return { models, source: "openrouter", fetchedAt: Date.now() };
}

/**
 * Server-side catalog with a small in-memory cache. Shared by /api/models and
 * the Codenames seat validation so both see the same capabilities.
 */
export async function getModelCatalog(
  options: { force?: boolean } = {},
): Promise<ModelCatalog> {
  const now = Date.now();
  const ttl = cache?.source === "fallback" ? FALLBACK_TTL_MS : CACHE_TTL_MS;

  if (!options.force && cache && now - cache.fetchedAt < ttl) {
    return cache;
  }

  try {
    cache = await fetchCatalog();
  } catch (error) {
    const reason =
      error instanceof Error
        ? error.message
        : "Unknown error while contacting OpenRouter";
    cache = {
      models: FALLBACK_MODELS,
      source: "fallback",
      fetchedAt: Date.now(),
      warning: `Could not load the live catalog (${reason}). Showing reference models.`,
    };
  }

  return cache;
}

export function clearModelCatalogCache(): void {
  cache = null;
}

export function findModel(
  models: readonly ModelInfo[],
  modelId: string,
): ModelInfo | undefined {
  return models.find((model) => model.id === modelId);
}

/**
 * An empty supported_parameters list means the catalog did not expose
 * capabilities; in that case we do not block the model.
 */
export function supportsToolCalling(model: ModelInfo | undefined): boolean {
  if (!model) return false;
  if (model.supportedParameters.length === 0) return true;
  return model.supportedParameters.includes("tools");
}
