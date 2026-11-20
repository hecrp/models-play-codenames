"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Language } from "@/lib/codenames/types";

export type Locale = Language;

export const LOCALES: Array<{ id: Locale; label: string }> = [
  { id: "es", label: "Español" },
  { id: "en", label: "English" },
];

const LOCALE_KEY = "codenames:locale:v1";

/** Read outside React (e.g. to send the x-locale header). */
export function loadLocale(): Locale {
  if (typeof window === "undefined") return "es";
  try {
    const stored = window.localStorage.getItem(LOCALE_KEY);
    if (stored === "es" || stored === "en") return stored;
  } catch {
    // Ignore storage failures.
  }
  return window.navigator.language?.toLowerCase().startsWith("es") ? "es" : "en";
}

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: "es",
  setLocale: () => {},
});

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("es");

  useEffect(() => {
    setLocaleState(loadLocale());
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(LOCALE_KEY, next);
    } catch {
      // Ignore storage failures.
    }
  }, []);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext);
}

/** Picks the strings of the current locale from a component-local dictionary. */
export function useStrings<T>(dictionary: Record<Locale, T>): T {
  return dictionary[useLocale().locale];
}
