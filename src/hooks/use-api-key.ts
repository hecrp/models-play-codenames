"use client";

import { useCallback, useEffect, useState } from "react";
import { loadApiKey, saveApiKey } from "@/lib/storage";

export function useApiKey() {
  const [apiKey, setApiKeyState] = useState("");

  useEffect(() => {
    setApiKeyState(loadApiKey());
  }, []);

  const setApiKey = useCallback((value: string) => {
    setApiKeyState(value);
    saveApiKey(value);
  }, []);

  return { apiKey, setApiKey };
}
