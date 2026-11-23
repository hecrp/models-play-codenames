"use client";

import { useEffect, useState } from "react";
import { Check, Eye, EyeOff, KeyRound } from "lucide-react";
import { IconButton } from "./ui";
import { cn } from "@/lib/utils";
import { useStrings, type Locale } from "@/lib/i18n";
import {
  DIRECT_PROVIDERS,
  PROVIDERS,
  type DirectProvider,
  type ProviderRoute,
} from "@/lib/codenames/providers";
import type { ProviderSettings } from "@/lib/storage";

const ES = {
  models: (prefix: string) => `Modelos ${prefix}…`,
  serverKey: "Clave del servidor",
  localKey: "Clave guardada aquí",
  noKey: "Sin clave",
  direct: "Su API",
  openrouter: "OpenRouter",
  routeLabel: (provider: string) => `Cómo llamar a los modelos de ${provider}`,
  viaDirect: (provider: string) => `Se llaman con tu clave de ${provider}.`,
  viaDirectNoKey:
    "Sin clave de este proveedor, sus modelos irán por OpenRouter hasta que añadas una.",
  viaOpenRouter: "Se llaman por OpenRouter aunque haya clave propia.",
  inputLabel: (provider: string) => `API key de ${provider}`,
  hideKey: "Ocultar clave",
  showKey: "Mostrar clave",
  save: "Guardar",
  saved: "Guardado",
  remove: "Quitar",
  createKey: "Crear clave",
  serverKeyHelp: (envVar: string) =>
    `${envVar} está definida en el servidor. Una clave guardada aquí tiene prioridad.`,
};

const STRINGS: Record<Locale, typeof ES> = {
  es: ES,
  en: {
    models: (prefix) => `${prefix}… models`,
    serverKey: "Server key",
    localKey: "Key saved here",
    noKey: "No key",
    direct: "Own API",
    openrouter: "OpenRouter",
    routeLabel: (provider) => `How to call ${provider} models`,
    viaDirect: (provider) => `Called with your ${provider} key.`,
    viaDirectNoKey: "Without a key for this provider, its models go through OpenRouter until you add one.",
    viaOpenRouter: "Called through OpenRouter even if there is a key of its own.",
    inputLabel: (provider) => `${provider} API key`,
    hideKey: "Hide key",
    showKey: "Show key",
    save: "Save",
    saved: "Saved",
    remove: "Remove",
    createKey: "Create key",
    serverKeyHelp: (envVar) => `${envVar} is set on the server. A key saved here takes priority.`,
  },
};

function ProviderCard({
  provider,
  savedKey,
  serverKey,
  route,
  onSaveKey,
  onRoute,
}: {
  provider: DirectProvider;
  savedKey: string;
  serverKey: boolean;
  route: ProviderRoute;
  onSaveKey: (key: string) => void;
  onRoute: (route: ProviderRoute) => void;
}) {
  const t = useStrings(STRINGS);
  const info = PROVIDERS[provider];
  const [draft, setDraft] = useState(savedKey);
  const [show, setShow] = useState(false);
  const [saved, setSaved] = useState(false);
  const hasKey = Boolean(savedKey) || serverKey;

  useEffect(() => {
    setDraft(savedKey);
  }, [savedKey]);

  const save = (value: string) => {
    onSaveKey(value);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="rounded-xl border border-line bg-panel p-3">
      <div className="flex flex-wrap items-center gap-2">
        <KeyRound size={14} className={hasKey ? "text-accent" : "text-faint"} />
        <span className="text-[13px] font-semibold text-ink">{info.label}</span>
        <span className="font-mono text-[11px] text-faint">{t.models(info.prefix)}</span>
        <span
          className={cn(
            "ml-auto rounded-full border px-2 py-px text-[10.5px] font-medium",
            hasKey ? "border-accent/40 text-accent" : "border-line text-faint",
          )}
        >
          {savedKey ? t.localKey : serverKey ? t.serverKey : t.noKey}
        </span>
      </div>

      <div
        role="radiogroup"
        aria-label={t.routeLabel(info.label)}
        className="mt-2.5 grid grid-cols-2 gap-1 rounded-lg border border-line bg-canvas p-0.5"
      >
        {(["direct", "openrouter"] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={route === option}
            onClick={() => onRoute(option)}
            className={cn(
              "h-8 rounded-md text-[12px] font-medium transition-colors",
              route === option ? "bg-accent text-accent-ink" : "text-muted hover:bg-hover hover:text-ink",
            )}
          >
            {option === "direct" ? t.direct : t.openrouter}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
        {route === "openrouter"
          ? t.viaOpenRouter
          : hasKey
            ? t.viaDirect(info.label)
            : t.viaDirectNoKey}
        {serverKey && !savedKey ? ` ${t.serverKeyHelp(info.envVar)}` : ""}
      </p>

      <div className="relative mt-2">
        <input
          type={show ? "text" : "password"}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={info.keyPlaceholder}
          autoComplete="off"
          spellCheck={false}
          aria-label={t.inputLabel(info.label)}
          className="h-9 w-full rounded-lg border border-line bg-canvas px-3 pr-10 font-mono text-[12px] outline-none transition-colors placeholder:text-faint focus:border-accent/60"
        />
        <IconButton
          label={show ? t.hideKey : t.showKey}
          size="sm"
          onClick={() => setShow((value) => !value)}
          className="absolute right-1 top-1/2 -translate-y-1/2"
        >
          {show ? <EyeOff size={13} /> : <Eye size={13} />}
        </IconButton>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => save(draft.trim())}
          disabled={!draft.trim() || draft.trim() === savedKey}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[12px] font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-40"
        >
          {saved ? <Check size={12} /> : null}
          {saved ? t.saved : t.save}
        </button>
        {savedKey && (
          <button
            type="button"
            onClick={() => save("")}
            className="h-8 rounded-lg px-2 text-[12px] text-muted transition-colors hover:bg-hover hover:text-danger"
          >
            {t.remove}
          </button>
        )}
        <a
          href={info.keysUrl}
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

/** One card per direct provider: its key and whether its models skip OpenRouter. */
export function ProviderKeysPanel({
  settings,
  serverKeys,
  onChange,
}: {
  settings: ProviderSettings;
  serverKeys: Record<DirectProvider, boolean>;
  onChange: (settings: ProviderSettings) => void;
}) {
  return (
    <div className="space-y-2.5">
      {DIRECT_PROVIDERS.map((provider) => (
        <ProviderCard
          key={provider}
          provider={provider}
          savedKey={settings.keys[provider] ?? ""}
          serverKey={serverKeys[provider]}
          route={settings.routing[provider] ?? "direct"}
          onSaveKey={(key) => {
            const keys = { ...settings.keys };
            if (key) keys[provider] = key;
            else delete keys[provider];
            onChange({ ...settings, keys });
          }}
          onRoute={(route) =>
            onChange({ ...settings, routing: { ...settings.routing, [provider]: route } })
          }
        />
      ))}
    </div>
  );
}
