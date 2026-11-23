import {
  DIRECT_PROVIDERS,
  parseProviderRouting,
  type DirectProvider,
  type ProviderRouting,
} from "./codenames/providers";
import {
  applyThemeToDocument,
  DEFAULT_THEME,
  isTheme,
  type Theme,
} from "./themes";

const API_KEY_STORAGE = "openchat:api-key:v1";
const THEME_KEY = "openchat:theme:v1";

export function loadApiKey(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(API_KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

export function saveApiKey(apiKey: string): void {
  if (typeof window === "undefined") return;
  try {
    if (apiKey) window.localStorage.setItem(API_KEY_STORAGE, apiKey);
    else window.localStorage.removeItem(API_KEY_STORAGE);
  } catch {
    // Ignore storage failures.
  }
}

export type { Theme };

export function loadTheme(): Theme {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    return isTheme(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function saveTheme(theme: Theme): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Ignore storage failures.
  }
  applyThemeToDocument(theme);
}

const PROVIDERS_STORAGE = "codenames:providers:v1";

/**
 * Direct provider keys saved in this browser and how each provider's models
 * are called. Keys travel to the local server in request headers only.
 */
export interface ProviderSettings {
  keys: Partial<Record<DirectProvider, string>>;
  routing: ProviderRouting;
}

export const EMPTY_PROVIDER_SETTINGS: ProviderSettings = { keys: {}, routing: {} };

export function loadProviderSettings(): ProviderSettings {
  if (typeof window === "undefined") return EMPTY_PROVIDER_SETTINGS;
  try {
    const raw = JSON.parse(window.localStorage.getItem(PROVIDERS_STORAGE) ?? "null") as {
      keys?: Record<string, unknown>;
      routing?: unknown;
    } | null;
    if (!raw || typeof raw !== "object") return EMPTY_PROVIDER_SETTINGS;
    const keys: ProviderSettings["keys"] = {};
    for (const provider of DIRECT_PROVIDERS) {
      const key = raw.keys?.[provider];
      if (typeof key === "string" && key.trim()) keys[provider] = key.trim();
    }
    return { keys, routing: parseProviderRouting(raw.routing) ?? {} };
  } catch {
    return EMPTY_PROVIDER_SETTINGS;
  }
}

export function saveProviderSettings(settings: ProviderSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PROVIDERS_STORAGE, JSON.stringify(settings));
  } catch {
    // Ignore storage failures.
  }
}
