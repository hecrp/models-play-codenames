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
