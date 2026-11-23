"use client";

import { useCallback, useEffect, useState } from "react";
import {
  EMPTY_PROVIDER_SETTINGS,
  loadProviderSettings,
  saveProviderSettings,
  type ProviderSettings,
} from "@/lib/storage";

export function useProviderSettings() {
  const [settings, setSettingsState] = useState<ProviderSettings>(EMPTY_PROVIDER_SETTINGS);

  useEffect(() => {
    setSettingsState(loadProviderSettings());
  }, []);

  const setSettings = useCallback((next: ProviderSettings) => {
    setSettingsState(next);
    saveProviderSettings(next);
  }, []);

  return { providerSettings: settings, setProviderSettings: setSettings };
}
