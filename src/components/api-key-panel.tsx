"use client";

import { useEffect, useState } from "react";
import { Check, Eye, EyeOff, KeyRound } from "lucide-react";
import { IconButton } from "./ui";
import { useStrings, type Locale } from "@/lib/i18n";

const ES = {
  serverKey: "Clave del servidor detectada",
  localKey: "Clave local configurada",
  noKey: "Sin clave configurada",
  serverKeyHelp:
    "OPENROUTER_API_KEY está definida en el servidor. Si guardas una clave aquí, se usará esa en su lugar.",
  noKeyHelp:
    "Sin clave, las peticiones fallarán. También puedes definir OPENROUTER_API_KEY en .env.local.",
  inputLabel: "API key de OpenRouter",
  hideKey: "Ocultar clave",
  showKey: "Mostrar clave",
  saved: "Guardado",
  saveKey: "Guardar clave",
  remove: "Quitar",
  createKey: "Crear clave",
};

const STRINGS: Record<Locale, typeof ES> = {
  es: ES,
  en: {
    serverKey: "Server key detected",
    localKey: "Local key configured",
    noKey: "No key configured",
    serverKeyHelp:
      "OPENROUTER_API_KEY is set on the server. If you save a key here, it will be used instead.",
    noKeyHelp:
      "Without a key, requests will fail. You can also set OPENROUTER_API_KEY in .env.local.",
    inputLabel: "OpenRouter API key",
    hideKey: "Hide key",
    showKey: "Show key",
    saved: "Saved",
    saveKey: "Save key",
    remove: "Remove",
    createKey: "Create key",
  },
};

export function ApiKeyPanel({
  apiKey,
  hasServerKey,
  onChange,
}: {
  apiKey: string;
  hasServerKey: boolean;
  onChange: (value: string) => void;
}) {
  const t = useStrings(STRINGS);
  const [draftKey, setDraftKey] = useState(apiKey);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraftKey(apiKey);
  }, [apiKey]);

  const saveKey = () => {
    onChange(draftKey.trim());
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };

  const clearKey = () => {
    setDraftKey("");
    onChange("");
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="rounded-xl border border-line bg-panel p-3">
      <div className="flex items-center gap-2">
        <KeyRound
          size={14}
          className={apiKey || hasServerKey ? "text-accent" : "text-amber-500"}
        />
        <span className="text-[12px] font-medium">
          {hasServerKey
            ? t.serverKey
            : apiKey
              ? t.localKey
              : t.noKey}
        </span>
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-muted">
        {hasServerKey ? t.serverKeyHelp : t.noKeyHelp}
      </p>

      <div className="relative mt-2.5">
        <input
          type={showKey ? "text" : "password"}
          value={draftKey}
          onChange={(event) => setDraftKey(event.target.value)}
          placeholder="sk-or-v1-…"
          autoComplete="off"
          spellCheck={false}
          aria-label={t.inputLabel}
          className="h-10 w-full rounded-lg border border-line bg-canvas px-3 pr-10 font-mono text-[12.5px] outline-none transition-colors placeholder:text-faint focus:border-accent/60"
        />
        <IconButton
          label={showKey ? t.hideKey : t.showKey}
          size="sm"
          onClick={() => setShowKey((value) => !value)}
          className="absolute right-1 top-1/2 -translate-y-1/2"
        >
          {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
        </IconButton>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={saveKey}
          disabled={!draftKey.trim() || draftKey.trim() === apiKey}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-[12px] font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-40"
        >
          {saved ? <Check size={12} /> : null}
          {saved ? t.saved : t.saveKey}
        </button>
        {apiKey && (
          <button
            type="button"
            onClick={clearKey}
            className="h-9 rounded-lg px-2 text-[12px] text-muted transition-colors hover:bg-hover hover:text-danger"
          >
            {t.remove}
          </button>
        )}
        <a
          href="https://openrouter.ai/keys"
          target="_blank"
          rel="noreferrer noopener"
          className="ml-auto text-[11.5px] text-accent underline-offset-2 hover:underline"
        >
          {t.createKey}
        </a>
      </div>
    </div>
  );
}
