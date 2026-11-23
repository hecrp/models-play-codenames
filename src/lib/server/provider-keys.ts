import {
  DIRECT_PROVIDERS,
  PROVIDERS,
  routeForModel,
  type DirectProvider,
} from "@/lib/codenames/providers";
import { SEATS } from "@/lib/codenames/seats";
import type { GameConfig, Seat } from "@/lib/codenames/types";

/**
 * API keys a game can use. A key saved in the browser travels in a request
 * header and wins over the server's environment variable. Keys live only in
 * memory while a game runs: they are never written to the database.
 */
export interface ProviderKeys {
  openrouter: string | null;
  openai: string | null;
  anthropic: string | null;
  google: string | null;
}

function envKey(name: string): string | null {
  return process.env[name]?.trim() || null;
}

/** Fallback env names some people already have set for Gemini. */
const ENV_ALIASES: Partial<Record<DirectProvider, string[]>> = {
  google: ["GOOGLE_API_KEY"],
};

function serverKey(provider: DirectProvider): string | null {
  for (const name of [PROVIDERS[provider].envVar, ...(ENV_ALIASES[provider] ?? [])]) {
    const key = envKey(name);
    if (key) return key;
  }
  return null;
}

export function resolveProviderKeys(headers?: Headers | null): ProviderKeys {
  const header = (name: string) => headers?.get(name)?.trim() || null;
  const keys: ProviderKeys = {
    openrouter: header("x-openrouter-key") ?? envKey("OPENROUTER_API_KEY"),
    openai: null,
    anthropic: null,
    google: null,
  };
  for (const provider of DIRECT_PROVIDERS) {
    keys[provider] = header(PROVIDERS[provider].header) ?? serverKey(provider);
  }
  return keys;
}

/** Which keys the server environment provides (never the keys themselves). */
export function serverKeyFlags(): Record<"openrouter" | DirectProvider, boolean> {
  return {
    openrouter: Boolean(envKey("OPENROUTER_API_KEY")),
    openai: Boolean(serverKey("openai")),
    anthropic: Boolean(serverKey("anthropic")),
    google: Boolean(serverKey("google")),
  };
}

/**
 * AI seats that no key can serve: their model has no usable direct route and
 * there is no OpenRouter key either.
 */
export function seatsWithoutKey(config: GameConfig, keys: ProviderKeys): Seat[] {
  return SEATS.filter((seat) => {
    const seatConfig = config.seats[seat];
    if (seatConfig.human) return false;
    const via = routeForModel(seatConfig.modelId, config.providers, (provider) =>
      Boolean(keys[provider]),
    );
    return via === "openrouter" ? !keys.openrouter : !keys[via];
  });
}

/** The adapter options for these keys and the game's routing. */
export function adapterKeys(keys: ProviderKeys, config: GameConfig) {
  return {
    apiKey: keys.openrouter,
    directKeys: { openai: keys.openai, anthropic: keys.anthropic, google: keys.google },
    routing: config.providers,
  };
}
