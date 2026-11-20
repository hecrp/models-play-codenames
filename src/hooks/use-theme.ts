"use client";

import { useCallback, useEffect, useState } from "react";
import { loadTheme, saveTheme, type Theme } from "@/lib/storage";
import { applyThemeToDocument, isDarkTheme } from "@/lib/themes";

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    const stored = loadTheme();
    setThemeState(stored);
    applyThemeToDocument(stored);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    saveTheme(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const next: Theme = isDarkTheme(current) ? "light" : "dark";
      saveTheme(next);
      return next;
    });
  }, []);

  return { theme, setTheme, toggleTheme, isDark: isDarkTheme(theme) };
}
