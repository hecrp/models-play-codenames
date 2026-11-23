/**
 * Direct providers: models whose OpenRouter id starts with one of these
 * prefixes can be called with the provider's own API key instead of going
 * through OpenRouter. The model catalog and ids stay OpenRouter's; only the
 * transport changes.
 */
export const DIRECT_PROVIDERS = ["openai", "anthropic", "google"] as const;
export type DirectProvider = (typeof DIRECT_PROVIDERS)[number];

/** How each provider's models are called. Missing means "direct" when a key exists. */
export type ProviderRoute = "direct" | "openrouter";
export type ProviderRouting = Partial<Record<DirectProvider, ProviderRoute>>;

/** Who actually serves a seat. */
export type ModelVia = "openrouter" | DirectProvider;

export interface ProviderInfo {
  id: DirectProvider;
  label: string;
  /** OpenRouter id prefix of this provider's models. */
  prefix: string;
  /** Environment variable read by the server. */
  envVar: string;
  /** Request header the browser sends a locally saved key in. */
  header: string;
  keyPlaceholder: string;
  keysUrl: string;
}

export const PROVIDERS: Record<DirectProvider, ProviderInfo> = {
  openai: {
    id: "openai",
    label: "OpenAI",
    prefix: "openai/",
    envVar: "OPENAI_API_KEY",
    header: "x-openai-key",
    keyPlaceholder: "sk-proj-…",
    keysUrl: "https://platform.openai.com/api-keys",
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    prefix: "anthropic/",
    envVar: "ANTHROPIC_API_KEY",
    header: "x-anthropic-key",
    keyPlaceholder: "sk-ant-…",
    keysUrl: "https://platform.claude.com/settings/keys",
  },
  google: {
    id: "google",
    label: "Google Gemini",
    prefix: "google/",
    envVar: "GEMINI_API_KEY",
    header: "x-gemini-key",
    keyPlaceholder: "AIza…",
    keysUrl: "https://aistudio.google.com/apikey",
  },
};

export function isDirectProvider(value: unknown): value is DirectProvider {
  return typeof value === "string" && (DIRECT_PROVIDERS as readonly string[]).includes(value);
}

/**
 * Open-weight models published under a provider's name but not served by its
 * API (OpenAI's gpt-oss, Google's Gemma): they always go through OpenRouter.
 */
const NOT_ON_PROVIDER_API = [/^openai\/gpt-oss/, /^google\/gemma/];

/** The direct provider behind an OpenRouter model id, if its API serves it. */
export function providerOfModel(modelId: string): DirectProvider | null {
  if (NOT_ON_PROVIDER_API.some((pattern) => pattern.test(modelId))) return null;
  for (const provider of DIRECT_PROVIDERS) {
    if (modelId.startsWith(PROVIDERS[provider].prefix)) return provider;
  }
  return null;
}

/**
 * The provider's own id for an OpenRouter model id: no prefix and no
 * OpenRouter variant suffix (":free", ":thinking"…). Anthropic writes versions
 * with dashes where OpenRouter uses dots (claude-sonnet-5.5 → claude-sonnet-5-5).
 */
export function nativeModelId(modelId: string, provider: DirectProvider): string {
  const bare = modelId.slice(PROVIDERS[provider].prefix.length).split(":")[0];
  return provider === "anthropic" ? bare.replace(/\./g, "-") : bare;
}

/**
 * Which transport serves a model: its provider's API when the routing allows
 * it (direct is the default) and a key for it exists; OpenRouter otherwise.
 */
export function routeForModel(
  modelId: string,
  routing: ProviderRouting | undefined,
  hasKey: (provider: DirectProvider) => boolean,
): ModelVia {
  const provider = providerOfModel(modelId);
  if (!provider) return "openrouter";
  if ((routing?.[provider] ?? "direct") === "openrouter") return "openrouter";
  return hasKey(provider) ? provider : "openrouter";
}

/** Keep only valid entries of an untrusted routing object. */
export function parseProviderRouting(raw: unknown): ProviderRouting | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const routing: ProviderRouting = {};
  for (const provider of DIRECT_PROVIDERS) {
    const value = (raw as Record<string, unknown>)[provider];
    if (value === "direct" || value === "openrouter") routing[provider] = value;
  }
  return Object.keys(routing).length > 0 ? routing : undefined;
}
