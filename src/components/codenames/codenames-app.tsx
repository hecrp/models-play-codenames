"use client";

import { useCallback, useEffect, useState } from "react";
import { Gamepad2, BookOpen, Settings, X } from "lucide-react";
import { useModels } from "@/hooks/use-models";
import { useTheme } from "@/hooks/use-theme";
import { useApiKey } from "@/hooks/use-api-key";
import { THEMES } from "@/lib/themes";
import {
  Drawer,
  IconButton,
  Logo,
  ThemePicker,
} from "@/components/ui";
import { Backdrop, ThemeMenu } from "./effects";
import { ApiKeyPanel } from "@/components/api-key-panel";
import { SetupScreen } from "./setup-screen";
import { GameScreen } from "./game-screen";
import { RulesScreen } from "./rules-screen";
import { saveActiveGame } from "@/lib/codenames/client-api";
import { useStrings, type Locale } from "@/lib/i18n";
import { LocaleSwitch } from "./locale-switch";

const ES = {
  loading: "Cargando Codenames…",
  backToGame: "Volver a la partida",
  backToSetup: "Volver a configurar",
  sections: "Secciones de Codenames",
  setup: "Configurar",
  howItWorks: "Cómo funciona",
  howItWorksLabel: "Cómo funciona Codenames",
  settings: "Ajustes de Codenames",
  closeSettings: "Cerrar ajustes",
  apiKeyTitle: "API key de OpenRouter",
  apiKeyHelp:
    "Los cuatro asientos usan la misma clave. Las claves enviadas desde el navegador se guardan solo en memoria durante la partida.",
  appearance: "Apariencia",
  themesHelp: (n: number) =>
    `${n} temas. Cada uno cambia el tablero, las cartas y el ambiente.`,
  cheapModels: "Modelos baratos de ejemplo",
  cheapModelsHelp:
    "Todos admiten tool calling. En la configuración puedes aplicarlos a los cuatro asientos con un clic.",
};

const STRINGS: Record<Locale, typeof ES> = {
  es: ES,
  en: {
    loading: "Loading Codenames…",
    backToGame: "Back to the game",
    backToSetup: "Back to setup",
    sections: "Codenames sections",
    setup: "Setup",
    howItWorks: "How it works",
    howItWorksLabel: "How Codenames works",
    settings: "Codenames settings",
    closeSettings: "Close settings",
    apiKeyTitle: "OpenRouter API key",
    apiKeyHelp:
      "All four seats use the same key. Keys sent from the browser are kept in memory only for the duration of the game.",
    appearance: "Appearance",
    themesHelp: (n: number) =>
      `${n} themes. Each one changes the board, the cards and the mood.`,
    cheapModels: "Cheap example models",
    cheapModelsHelp:
      "All of them support tool calling. In the setup you can apply them to all four seats with one click.",
  },
};

type Route =
  | { kind: "setup" }
  | { kind: "game"; id: string; mode: "live" | "replay" };

function parseHash(): Route {
  if (typeof window === "undefined") return { kind: "setup" };
  const match = window.location.hash.match(/^#g=([^&]+)(?:&replay=1)?$/);
  if (!match) return { kind: "setup" };
  const replay = window.location.hash.includes("replay=1");
  return {
    kind: "game",
    id: decodeURIComponent(match[1]),
    mode: replay ? "replay" : "live",
  };
}

function setHash(route: Route): void {
  if (typeof window === "undefined") return;
  if (route.kind === "setup") {
    window.history.replaceState(null, "", window.location.pathname);
    return;
  }
  const suffix = route.mode === "replay" ? "&replay=1" : "";
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}#g=${encodeURIComponent(route.id)}${suffix}`,
  );
}

export function CodenamesApp() {
  const t = useStrings(STRINGS);
  const modelsState = useModels();
  const { theme, setTheme } = useTheme();
  const { apiKey, setApiKey } = useApiKey();
  const [route, setRoute] = useState<Route>({ kind: "setup" });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setRoute(parseHash());
    setMounted(true);
    const onHashChange = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = useCallback((next: Route) => {
    setHash(next);
    setRoute(next);
  }, []);

  const startGame = useCallback(
    (gameId: string) => {
      saveActiveGame(gameId);
      navigate({ kind: "game", id: gameId, mode: "live" });
    },
    [navigate],
  );

  const exitGame = useCallback(() => {
    saveActiveGame(null);
    navigate({ kind: "setup" });
  }, [navigate]);

  if (!mounted) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas">
        <Backdrop />
        <span className="shimmer-text relative font-display text-[15px] uppercase tracking-[0.2em]">
          {t.loading}
        </span>
      </div>
    );
  }

  return (
    <div className="relative min-h-dvh bg-canvas text-ink">
      <Backdrop />
      {rulesOpen ? (
        <RulesScreen
          onBack={() => setRulesOpen(false)}
          backLabel={
            route.kind === "game" ? t.backToGame : t.backToSetup
          }
          theme={theme}
          onThemeChange={setTheme}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      ) : (
        <>
          {route.kind === "setup" && (
            <header className="glass sticky top-0 z-30 flex h-14 items-center gap-2 border-0 border-b px-3 sm:px-5">
              <Logo size={24} />
              <span className="inline-flex items-center gap-1 text-[14.5px] font-semibold tracking-tight text-ink">
                <Gamepad2 size={14} />
                Codenames
              </span>
              <nav
                aria-label={t.sections}
                className="ml-auto hidden items-center gap-1 md:flex"
              >
                <span className="rounded-lg bg-panel px-3 py-1.5 text-[12.5px] font-semibold text-ink">
                  {t.setup}
                </span>
                <button
                  type="button"
                  onClick={() => setRulesOpen(true)}
                  className="rounded-lg px-3 py-1.5 text-[12.5px] font-medium text-muted transition-colors hover:bg-hover hover:text-ink"
                >
                  {t.howItWorks}
                </button>
              </nav>
              <div className="ml-2 flex items-center gap-1">
                <IconButton
                  label={t.howItWorksLabel}
                  onClick={() => setRulesOpen(true)}
                  className="md:hidden"
                >
                  <BookOpen size={16} />
                </IconButton>
                <LocaleSwitch />
                <ThemeMenu theme={theme} onChange={setTheme} />
                <IconButton
                  label={t.settings}
                  onClick={() => setSettingsOpen(true)}
                >
                  <Settings size={16} />
                </IconButton>
              </div>
            </header>
          )}

          {route.kind === "setup" ? (
            <SetupScreen
              models={modelsState.models}
              modelsLoading={modelsState.loading}
              source={modelsState.source}
              warning={modelsState.warning}
              error={modelsState.error}
              hasServerKey={modelsState.hasServerKey}
              apiKey={apiKey}
              onOpenSettings={() => setSettingsOpen(true)}
              onStarted={startGame}
              onOpenGame={(id, mode) => navigate({ kind: "game", id, mode })}
              onRefreshModels={modelsState.refresh}
            />
          ) : (
            <GameScreen
              gameId={route.id}
              mode={route.mode}
              apiKey={apiKey}
              hasServerKey={modelsState.hasServerKey}
              onExit={exitGame}
              onReplay={() =>
                navigate({ kind: "game", id: route.id, mode: "replay" })
              }
              onNewGame={exitGame}
              onStarted={startGame}
              onOpenRules={() => setRulesOpen(true)}
              onOpenSettings={() => setSettingsOpen(true)}
              theme={theme}
              onThemeChange={setTheme}
            />
          )}
        </>
      )}

      <Drawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        label={t.settings}
      >
        <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-line px-4">
          <Settings size={16} className="text-muted" />
          <h2 className="text-[16px] font-semibold">{t.settings}</h2>
          <IconButton
            label={t.closeSettings}
            onClick={() => setSettingsOpen(false)}
            className="ml-auto"
          >
            <X size={17} />
          </IconButton>
        </header>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <section>
            <h3 className="text-[14px] font-semibold text-ink">
              {t.apiKeyTitle}
            </h3>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
              {t.apiKeyHelp}
            </p>
            <div className="mt-2.5">
              <ApiKeyPanel
                apiKey={apiKey}
                hasServerKey={modelsState.hasServerKey}
                onChange={setApiKey}
              />
            </div>
          </section>

          <section>
            <h3 className="text-[14px] font-semibold text-ink">{t.appearance}</h3>
            <p className="mt-0.5 text-[12.5px] text-muted">
              {t.themesHelp(THEMES.length)}
            </p>
            <div className="mt-2.5">
              <ThemePicker value={theme} onChange={setTheme} />
            </div>
          </section>

          <section className="rounded-xl border border-line bg-panel p-3">
            <h3 className="text-[13.5px] font-semibold text-ink">
              {t.cheapModels}
            </h3>
            <ul className="mt-1.5 space-y-1 text-[12px] text-muted">
              <li>• openai/gpt-oss-20b</li>
              <li>• meta-llama/llama-3.1-8b-instruct</li>
              <li>• inclusionai/ling-3.0-flash</li>
            </ul>
            <p className="mt-2 text-[11.5px] leading-relaxed text-faint">
              {t.cheapModelsHelp}
            </p>
          </section>
        </div>
      </Drawer>
    </div>
  );
}
