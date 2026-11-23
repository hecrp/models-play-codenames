"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ModelInfo, ModelsResponse } from "@/lib/types";
import { isAbortError } from "@/lib/utils";
import { useStrings, type Locale } from "@/lib/i18n";

const ES = {
  catalogStatus: (status: number) => `El catálogo respondió ${status}`,
  loadFailed: "No se pudo cargar el catálogo de modelos.",
};

const STRINGS: Record<Locale, typeof ES> = {
  es: ES,
  en: {
    catalogStatus: (status: number) => `The catalog responded ${status}`,
    loadFailed: "Could not load the model catalog.",
  },
};

export function useModels() {
  const t = useStrings(STRINGS);
  const stringsRef = useRef(t);
  useEffect(() => {
    stringsRef.current = t;
  }, [t]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<"openrouter" | "fallback" | null>(null);
  const [hasServerKey, setHasServerKey] = useState(false);
  const [serverKeys, setServerKeys] = useState<ModelsResponse["serverKeys"]>({
    openrouter: false,
    openai: false,
    anthropic: false,
    google: false,
  });
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/models", {
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(stringsRef.current.catalogStatus(response.status));
      }
      const payload = (await response.json()) as ModelsResponse;
      if (controller.signal.aborted) return;

      setModels(payload.models);
      setSource(payload.source);
      setHasServerKey(payload.hasServerKey);
      if (payload.serverKeys) setServerKeys(payload.serverKeys);
      setWarning(payload.warning ?? null);
    } catch (caught) {
      if (isAbortError(caught) || controller.signal.aborted) return;
      setError(
        caught instanceof Error
          ? caught.message
          : stringsRef.current.loadFailed,
      );
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  return {
    models,
    loading,
    source,
    hasServerKey,
    serverKeys,
    warning,
    error,
    refresh: load,
  };
}
