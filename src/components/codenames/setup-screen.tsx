"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  Brain,
  ChevronRight,
  Copy,
  Crown,
  Dices,
  Eye,
  Gamepad2,
  History,
  LoaderCircle,
  Play,
  Repeat2,
  Sparkles,
  Swords,
  User,
  Users,
  Wand2,
} from "lucide-react";
import type { ModelInfo } from "@/lib/types";
import type { ReasoningEffort, Seat, SeatConfig, Team } from "@/lib/codenames/types";
import { effortOptions, isReasoningEffort, resolveEffort } from "@/lib/codenames/reasoning";
import {
  AVATARS,
  DEFAULT_SEAT_AVATARS,
  avatarById,
  avatarName,
  isAvatarId,
} from "@/lib/codenames/avatars";
import {
  CODENAMES_EXAMPLE_MODELS,
  CODENAMES_MATCHUPS,
  DEFAULT_CODENAMES_MODEL_ID,
  estimateGameCostUsd,
} from "@/lib/codenames/model-presets";
import { randomSeed } from "@/lib/codenames/prng";
import { randomDemoId } from "@/lib/codenames/demo/ids";
import {
  PROVIDERS,
  routeForModel,
  type DirectProvider,
  type ModelVia,
} from "@/lib/codenames/providers";
import type { ProviderSettings } from "@/lib/storage";
import {
  SEATS,
  operativeSeat,
  spymasterSeat,
  teamOfSeat,
} from "@/lib/codenames/seats";
import { modelDisplayName, supportsParameter } from "@/lib/models";
import { cn, formatCost } from "@/lib/utils";
import {
  createCodenamesGame,
  fetchCodenamesGames,
  loadGodMode,
  saveActiveGame,
  saveGodMode,
  type CodenamesGameSummary,
} from "@/lib/codenames/client-api";
import {
  Badge,
  IconButton,
  Modal,
  Segmented,
  Slider,
  Switch,
} from "@/components/ui";
import { ModelPicker } from "@/components/model-picker";
import { useLocale, useStrings, type Locale } from "@/lib/i18n";
import { Avatar } from "./avatar";

const ES = {
  player: "Jugador",
  team: (team: Team): string => (team === "red" ? "rojo" : "azul"),
  spymaster: "Jefe de espías",
  operative: "Agente",
  humanOffTitle: "Devolver el asiento a un modelo",
  humanOnTitle: "Jugar tú en este asiento",
  you: "Tú",
  playMyself: "Jugar yo",
  changeAvatar: (name: string) => `Cambiar avatar de ${name}`,
  seatName: (seat: string) => `Nombre del asiento ${seat}`,
  humanSpymaster: "Juegas tú: verás los colores y escribirás las pistas.",
  humanOperative: "Juegas tú: sin modo dios, escribes o haces clic en las cartas.",
  temperature: "Temperatura",
  missingKey:
    "Algún modelo va por OpenRouter y no hay clave de OpenRouter: añádela o la de su proveedor en Ajustes.",
  viaOpenRouterHint: "Este modelo se llamará por OpenRouter.",
  viaDirectHint: (provider: string) =>
    `Este modelo se llamará con tu clave de ${provider}, sin pasar por OpenRouter.`,
  missingModels: "Faltan modelos en algún asiento.",
  createFailed: "No se pudo crear la partida.",
  watchDemo: "Ver una partida de demostración",
  demoHint: "Grabada con modelos reales · sin API key ni coste",
  heroText:
    "Cuatro asientos, cuatro modelos. El árbitro del servidor guarda el estado y solo enseña a cada modelo lo que su rol puede ver.",
  loadingHistory: "cargando historial",
  savedGames: (n: number) =>
    `${n} partida${n === 1 ? "" : "s"} guardada${n === 1 ? "" : "s"}`,
  loadingCatalog: "cargando catálogo",
  loadingCatalogEllipsis: "cargando catálogo…",
  toolModels: (n: number) => `${n} modelos con herramientas`,
  presets: "Presets",
  sameModel: "Mismo modelo",
  redVsBlue: "Rojo vs azul",
  spymastersVsOperatives: "Jefes vs agentes",
  crossed: "Cruzado",
  crossedTitle: "Cada modelo de rojo juega el rol contrario en azul",
  matchups: "Enfrentamientos:",
  exampleModels: "Modelos de ejemplo:",
  perGame: (cost: string) => `≈ ${cost} por partida típica`,
  seed: "Semilla",
  random: "Aleatoria",
  seedLabel: "Semilla de la partida",
  randomSeed: "Generar semilla aleatoria",
  seedHelp: "La misma semilla genera el mismo tablero y equipo inicial.",
  initialSpeed: "Velocidad inicial",
  costCap: "Tope de coste",
  costCapLabel: "Tope de coste en dólares",
  noLimit: "0 = sin límite",
  godMode: "Modo dios",
  godModeHelp: "Verás los colores de las cartas ocultas.",
  preparing: "Preparando…",
  startGame: "Iniciar partida",
  recentGames: "Partidas recientes",
  referenceCatalog: "Catálogo de referencia",
  noGames: "Todavía no hay partidas. Configura los asientos e inicia la primera.",
  seedN: (seed: number) => `Semilla ${seed}`,
  draw: "Tablas",
  wins: (team: string) => `Gana ${team}`,
  paused: "Pausada",
  aborted: "Abortada",
  inProgress: "En curso",
  turns: (n: number) => `${n} turnos`,
  redShort: "R",
  blueShort: "A",
  replay: "Replay",
  open: "Abrir",
  modelFor: (name: string) => `Modelo para ${name}`,
  chooseModel: "Elegir modelo",
  onlyToolModels: "Solo modelos con tool calling",
  chooseAvatar: "Elegir avatar",
  reasoning: "Razonamiento",
  reasoningHelp:
    "Cuánto piensa el modelo antes de jugar. Más razonamiento suele dar mejores jugadas, pero es más lento y caro.",
  effortAuto: (level: string) => `Auto (${level})`,
  efforts: {
    none: "Sin razonar",
    minimal: "Mínimo",
    low: "Bajo",
    medium: "Medio",
    high: "Alto",
    xhigh: "Muy alto",
    max: "Máximo",
  } as Record<ReasoningEffort, string>,
};

const STRINGS: Record<Locale, typeof ES> = {
  es: ES,
  en: {
    player: "Player",
    team: (team: Team) => (team === "red" ? "red" : "blue"),
    spymaster: "Spymaster",
    operative: "Operative",
    humanOffTitle: "Give the seat back to a model",
    humanOnTitle: "Play this seat yourself",
    you: "You",
    playMyself: "Play myself",
    changeAvatar: (name: string) => `Change avatar for ${name}`,
    seatName: (seat: string) => `Name for seat ${seat}`,
    humanSpymaster: "You play: you'll see the colors and write the clues.",
    humanOperative: "You play: no god mode, type or click on the cards.",
    temperature: "Temperature",
    missingKey:
      "A model goes through OpenRouter and there is no OpenRouter key: add it, or its provider's own, in Settings.",
    viaOpenRouterHint: "This model will be called through OpenRouter.",
    viaDirectHint: (provider: string) =>
      `This model will be called with your ${provider} key, skipping OpenRouter.`,
    missingModels: "Some seat is missing a model.",
    createFailed: "Could not create the game.",
    watchDemo: "Watch a demo game",
    demoHint: "Recorded with real models · no API key or cost",
    heroText:
      "Four seats, four models. The server referee keeps the state and only shows each model what its role is allowed to see.",
    loadingHistory: "loading history",
    savedGames: (n: number) => `${n} saved game${n === 1 ? "" : "s"}`,
    loadingCatalog: "loading catalog",
    loadingCatalogEllipsis: "loading catalog…",
    toolModels: (n: number) => `${n} models with tools`,
    presets: "Presets",
    sameModel: "Same model",
    redVsBlue: "Red vs blue",
    spymastersVsOperatives: "Spymasters vs operatives",
    crossed: "Crossed",
    crossedTitle: "Each red model plays the opposite role for blue",
    matchups: "Matchups:",
    exampleModels: "Example models:",
    perGame: (cost: string) => `≈ ${cost} per typical game`,
    seed: "Seed",
    random: "Random",
    seedLabel: "Game seed",
    randomSeed: "Generate random seed",
    seedHelp: "The same seed produces the same board and starting team.",
    initialSpeed: "Initial speed",
    costCap: "Cost cap",
    costCapLabel: "Cost cap in dollars",
    noLimit: "0 = no limit",
    godMode: "God mode",
    godModeHelp: "You'll see the colors of hidden cards.",
    preparing: "Preparing…",
    startGame: "Start game",
    recentGames: "Recent games",
    referenceCatalog: "Reference catalog",
    noGames: "No games yet. Set up the seats and start the first one.",
    seedN: (seed: number) => `Seed ${seed}`,
    draw: "Draw",
    wins: (team: string) => `${team.charAt(0).toUpperCase()}${team.slice(1)} wins`,
    paused: "Paused",
    aborted: "Aborted",
    inProgress: "In progress",
    turns: (n: number) => `${n} turn${n === 1 ? "" : "s"}`,
    redShort: "R",
    blueShort: "B",
    replay: "Replay",
    open: "Open",
    modelFor: (name: string) => `Model for ${name}`,
    chooseModel: "Choose model",
    onlyToolModels: "Only models with tool calling",
    chooseAvatar: "Choose avatar",
    reasoning: "Reasoning",
    reasoningHelp:
      "How much the model thinks before playing. More reasoning usually means better moves, but slower and more expensive.",
    effortAuto: (level: string) => `Auto (${level})`,
    efforts: {
      none: "Off",
      minimal: "Minimal",
      low: "Low",
      medium: "Medium",
      high: "High",
      xhigh: "Very high",
      max: "Max",
    },
  },
};

type SetupStrings = typeof ES;

const STORAGE_KEY = "openchat:codenames:setup:v1";

interface StoredSetup {
  seats: Partial<Record<Seat, Partial<SeatConfig>>>;
  seed?: number;
  speed?: number;
  maxCostUsd?: number | null;
  godMode?: boolean;
}

interface SetupScreenProps {
  models: ModelInfo[];
  modelsLoading: boolean;
  source: "openrouter" | "fallback" | null;
  warning: string | null;
  error: string | null;
  hasServerKey: boolean;
  /** Which provider keys the server environment defines. */
  serverKeys: Record<"openrouter" | DirectProvider, boolean>;
  providerSettings: ProviderSettings;
  apiKey: string;
  onOpenSettings: () => void;
  onStarted: (gameId: string) => void;
  onOpenGame: (gameId: string, mode: "live" | "replay") => void;
  onRefreshModels: () => void;
}

function defaultSeats(
  modelId: string,
  locale: Locale,
  t: SetupStrings,
): Record<Seat, SeatConfig> {
  return Object.fromEntries(
    SEATS.map((seat) => {
      const avatarId = DEFAULT_SEAT_AVATARS[seat];
      const avatar = avatarById(avatarId);
      return [
        seat,
        {
          seat,
          modelId,
          temperature: seat.endsWith("spymaster") ? 0.7 : 0.3,
          avatarId,
          displayName: avatar ? avatarName(avatar, locale) : t.player,
        },
      ];
    }),
  ) as Record<Seat, SeatConfig>;
}

function toolModelsFrom(models: ModelInfo[]): ModelInfo[] {
  const withTools = models.filter(
    (model) =>
      model.supportedParameters.length === 0 ||
      model.supportedParameters.includes("tools"),
  );
  return withTools.length > 0 ? withTools : models;
}

function pickDefaultModel(
  models: ModelInfo[],
  preferred: string | undefined,
): string {
  if (preferred && models.some((model) => model.id === preferred)) {
    return preferred;
  }
  if (models.some((model) => model.id === DEFAULT_CODENAMES_MODEL_ID)) {
    return DEFAULT_CODENAMES_MODEL_ID;
  }
  const featured = CODENAMES_EXAMPLE_MODELS.find((preset) =>
    models.some((model) => model.id === preset.id),
  );
  return featured?.id ?? models[0]?.id ?? DEFAULT_CODENAMES_MODEL_ID;
}

/**
 * Drop a stored effort the seat's current model does not accept (after a model
 * change), so the game uses exactly what the selector shows: "auto".
 */
function withSupportedEfforts(
  seats: Record<Seat, SeatConfig>,
  models: ModelInfo[],
): Record<Seat, SeatConfig> {
  return Object.fromEntries(
    SEATS.map((seat) => {
      const config = seats[seat];
      const model = models.find((candidate) => candidate.id === config.modelId);
      const keep =
        config.reasoningEffort !== undefined &&
        effortOptions(model).includes(config.reasoningEffort);
      const { reasoningEffort: _dropped, ...rest } = config;
      return [seat, keep ? config : rest];
    }),
  ) as Record<Seat, SeatConfig>;
}

function loadStoredSetup(): StoredSetup | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredSetup) : null;
  } catch {
    return null;
  }
}

const HERO_CARDS = [
  "assassin",
  "red",
  "neutral",
  "blue",
  "red",
  "blue",
  "red",
  "neutral",
  "blue",
  "red",
] as const;

const HERO_COLORS: Record<(typeof HERO_CARDS)[number], string> = {
  red: "var(--card-red)",
  blue: "var(--card-blue)",
  neutral: "var(--card-neutral)",
  assassin: "var(--card-assassin)",
};

function HeroBoard() {
  return (
    <div
      className="relative grid shrink-0 grid-cols-5 gap-[5px] rounded-xl border border-line/70 bg-canvas/40 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_10px_30px_-20px_rgba(0,0,0,0.7)]"
      aria-hidden="true"
    >
      {HERO_CARDS.map((color, index) => (
        <span
          key={index}
          className="mini-card relative block size-5 sm:size-6"
          style={{ "--i": index } as React.CSSProperties}
        >
          <span
            className="border border-line-strong/70 shadow-[0_1px_0_rgba(0,0,0,0.25)]"
            style={{
              background: "linear-gradient(160deg,var(--card-face),var(--card-face-2))",
            }}
          />
          <span
            style={{
              background: HERO_COLORS[color],
              opacity: color === "assassin" ? 0.95 : 0.9,
            }}
          />
        </span>
      ))}
    </div>
  );
}

function SeatEditor({
  seat,
  config,
  model,
  onChange,
  onPickModel,
  onPickAvatar,
  onToggleHuman,
  via,
}: {
  seat: Seat;
  config: SeatConfig;
  model: ModelInfo | undefined;
  /** Who will serve this seat's model: OpenRouter or its provider's own API. */
  via: ModelVia;
  onChange: (patch: Partial<SeatConfig>) => void;
  onPickModel: () => void;
  onPickAvatar: () => void;
  onToggleHuman: () => void;
}) {
  const t = useStrings(STRINGS);
  const team = teamOfSeat(seat);
  const isSpymaster = seat === spymasterSeat(team);
  const avatar = avatarById(config.avatarId) ?? AVATARS[0];
  const teamStyles =
    team === "red"
      ? "border-team-red/25 bg-[linear-gradient(155deg,color-mix(in_oklab,var(--team-red)_10%,transparent),transparent_60%)] hover:border-team-red/50"
      : "border-team-blue/25 bg-[linear-gradient(155deg,color-mix(in_oklab,var(--team-blue)_10%,transparent),transparent_60%)] hover:border-team-blue/50";
  const teamText = team === "red" ? "text-team-red-ink" : "text-team-blue-ink";
  const temperature = supportsParameter(model, "temperature");
  // Only levels this model accepts; "auto" is the app default adapted to it.
  const efforts = effortOptions(model);
  const autoEffort = resolveEffort(model, undefined);
  const chosenEffort =
    config.reasoningEffort && efforts.includes(config.reasoningEffort)
      ? config.reasoningEffort
      : "auto";

  return (
    <div
      className={cn(
        "lift group relative overflow-hidden rounded-2xl border p-3 backdrop-blur-sm",
        "shadow-[0_18px_40px_-32px_rgba(0,0,0,0.8)]",
        teamStyles,
      )}
    >
      <span
        className="pointer-events-none absolute -right-10 -top-10 size-24 rounded-full opacity-30 blur-2xl transition-opacity group-hover:opacity-60"
        style={{
          background: team === "red" ? "var(--team-red)" : "var(--team-blue)",
        }}
        aria-hidden="true"
      />
      <div className="relative flex items-start gap-2">
        <div className={cn("min-w-0 flex-1 leading-tight", teamText)}>
          <span className="block text-[10.5px] font-semibold uppercase tracking-[0.16em] opacity-75">
            {t.team(team)}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.12em]">
            {isSpymaster ? (
              <Crown size={11} className="shrink-0" />
            ) : (
              <Eye size={11} className="shrink-0" />
            )}
            <span className="truncate">{isSpymaster ? t.spymaster : t.operative}</span>
          </span>
        </div>
        <button
          type="button"
          onClick={onToggleHuman}
          aria-pressed={Boolean(config.human)}
          title={config.human ? t.humanOffTitle : t.humanOnTitle}
          className={cn(
            "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors",
            config.human
              ? "border-accent/50 bg-accent-soft text-accent"
              : "border-line bg-canvas/70 text-muted hover:text-ink",
          )}
        >
          <User size={11} />
          {config.human ? t.you : t.playMyself}
        </button>
      </div>

      <div className="relative mt-2 flex items-start gap-2.5">
        <button
          type="button"
          onClick={onPickAvatar}
          aria-label={t.changeAvatar(config.displayName)}
          className="rounded-full transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          <Avatar avatar={avatar} team={team} size={46} />
        </button>
        <div className="min-w-0 flex-1">
          <input
            value={config.displayName}
            onChange={(event) => onChange({ displayName: event.target.value })}
            maxLength={40}
            aria-label={t.seatName(seat)}
            className="h-8 w-full rounded-md border border-transparent bg-transparent px-0.5 text-[15px] font-semibold text-ink outline-none transition-colors hover:border-line focus:border-line-strong focus:bg-canvas"
          />
          {config.human ? (
            <p className="mt-0.5 rounded-lg border border-accent/30 bg-accent-soft/50 px-2 py-1.5 text-[12.5px] text-accent">
              {isSpymaster ? t.humanSpymaster : t.humanOperative}
            </p>
          ) : (
            <button
              type="button"
              onClick={onPickModel}
              className="mt-0.5 flex w-full items-center gap-1.5 rounded-lg border border-line bg-canvas/80 px-2 py-1.5 text-left transition-colors hover:border-line-strong hover:bg-hover"
            >
              <Bot size={11} className="shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-soft">
                {model ? modelDisplayName(model.name) : config.modelId}
              </span>
              <span
                className={cn(
                  "shrink-0 rounded-full border px-1.5 text-[10px] font-medium leading-4",
                  via === "openrouter" ? "border-line text-faint" : "border-accent/40 text-accent",
                )}
                title={via === "openrouter" ? t.viaOpenRouterHint : t.viaDirectHint(PROVIDERS[via].label)}
              >
                {via === "openrouter" ? "OpenRouter" : PROVIDERS[via].label}
              </span>
              <ChevronRight size={11} className="shrink-0 text-faint" />
            </button>
          )}
        </div>
      </div>

      {/* Same layout as the temperature row: label on the left, value on the right. */}
      {!config.human && efforts.length > 0 && (
        <label
          className="relative mt-3 flex items-center justify-between gap-2 text-[13px]"
          title={t.reasoningHelp}
        >
          <span className="inline-flex items-center gap-1.5 font-medium text-ink-soft">
            <Brain size={13} className="text-faint" />
            {t.reasoning}
          </span>
          <select
            value={chosenEffort}
            onChange={(event) =>
              onChange({
                reasoningEffort: isReasoningEffort(event.target.value)
                  ? event.target.value
                  : undefined,
              })
            }
            className="min-w-0 max-w-[60%] cursor-pointer rounded-md border border-line bg-canvas/80 px-1.5 py-0.5 text-[12px] text-ink-soft outline-none transition-colors hover:border-line-strong focus:border-line-strong"
          >
            <option value="auto">
              {t.effortAuto(autoEffort ? t.efforts[autoEffort] : "—")}
            </option>
            {efforts.map((effort) => (
              <option key={effort} value={effort}>
                {t.efforts[effort]}
              </option>
            ))}
          </select>
        </label>
      )}

      {!config.human && (
      <div className="relative mt-3">
        <Slider
          label={t.temperature}
          min={0}
          max={2}
          step={0.1}
          // null (not sent) only comes from study configs; show the app default.
          value={config.temperature ?? (config.seat.endsWith("spymaster") ? 0.7 : 0.3)}
          disabled={!temperature}
          onChange={(value) => onChange({ temperature: value })}
          formatValue={(value) => value.toFixed(1)}
        />
      </div>
      )}
    </div>
  );
}

export function SetupScreen({
  models,
  modelsLoading,
  source,
  warning,
  error: modelsError,
  hasServerKey,
  serverKeys,
  providerSettings,
  apiKey,
  onOpenSettings,
  onStarted,
  onOpenGame,
  onRefreshModels,
}: SetupScreenProps) {
  const t = useStrings(STRINGS);
  const { locale } = useLocale();
  const toolModels = useMemo(() => toolModelsFrom(models), [models]);
  const preferredModel = useMemo(
    () => pickDefaultModel(toolModels, undefined),
    [toolModels],
  );

  const [seats, setSeats] = useState<Record<Seat, SeatConfig>>(() =>
    defaultSeats(DEFAULT_CODENAMES_MODEL_ID, locale, t),
  );
  const [seed, setSeed] = useState<number | "">("");
  const [speed, setSpeed] = useState(1);
  const [maxCost, setMaxCost] = useState(1);
  const [godMode, setGodMode] = useState(() => loadGodMode());
  const [hydrated, setHydrated] = useState(false);
  const [targetSeat, setTargetSeat] = useState<Seat | null>(null);
  const [avatarSeat, setAvatarSeat] = useState<Seat | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<CodenamesGameSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    const stored = loadStoredSetup();
    if (stored) {
      setSeats((current) => {
        const next = { ...current };
        for (const seat of SEATS) {
          const raw = stored.seats?.[seat];
          if (!raw) continue;
          next[seat] = {
            ...next[seat],
            ...(typeof raw.modelId === "string" ? { modelId: raw.modelId } : {}),
            ...(typeof raw.temperature === "number"
              ? { temperature: Math.min(2, Math.max(0, raw.temperature)) }
              : {}),
            ...(typeof raw.avatarId === "string" && isAvatarId(raw.avatarId)
              ? { avatarId: raw.avatarId }
              : {}),
            ...(typeof raw.displayName === "string" && raw.displayName.trim()
              ? { displayName: raw.displayName.slice(0, 40) }
              : {}),
            human: raw.human === true,
            ...(isReasoningEffort(raw.reasoningEffort)
              ? { reasoningEffort: raw.reasoningEffort }
              : {}),
          };
        }
        return next;
      });
      if (typeof stored.seed === "number") setSeed(stored.seed);
      if (typeof stored.speed === "number" && [0.25, 0.5, 1, 2].includes(stored.speed)) {
        setSpeed(stored.speed);
      }
      if (typeof stored.maxCostUsd === "number") setMaxCost(stored.maxCostUsd);
      if (typeof stored.godMode === "boolean") {
        setGodMode(stored.godMode);
        saveGodMode(stored.godMode);
      }
    }
    setHydrated(true);
  }, []);

  // Default (avatar-derived) names follow the UI language; user-edited names stay.
  useEffect(() => {
    setSeats((current) => {
      let changed = false;
      const next = { ...current };
      for (const seat of SEATS) {
        const avatar = avatarById(next[seat].avatarId);
        if (!avatar) continue;
        const name = next[seat].displayName;
        const localized = avatarName(avatar, locale);
        if (name !== localized && (name === avatar.name || name === avatar.nameEn)) {
          next[seat] = { ...next[seat], displayName: localized };
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [locale, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const payload: StoredSetup = {
      seats,
      seed: seed === "" ? undefined : seed,
      speed,
      maxCostUsd: maxCost,
      godMode,
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage failures.
    }
  }, [godMode, hydrated, maxCost, seats, seed, speed]);

  useEffect(() => {
    if (!toolModels.length) return;
    setSeats((current) => {
      let changed = false;
      const next = { ...current };
      for (const seat of SEATS) {
        const exists = toolModels.some(
          (model) => model.id === next[seat].modelId,
        );
        if (!exists) {
          next[seat] = { ...next[seat], modelId: preferredModel };
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [preferredModel, toolModels]);

  useEffect(() => {
    let cancelled = false;
    setHistoryLoading(true);
    fetchCodenamesGames()
      .then((response) => {
        if (!cancelled) setHistory(response.games);
      })
      .catch(() => {
        if (!cancelled) setHistory([]);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateSeat = (seat: Seat, patch: Partial<SeatConfig>) => {
    setSeats((current) => ({
      ...current,
      [seat]: { ...current[seat], ...patch },
    }));
  };

  const applyToAll = (modelId: string) => {
    setSeats((current) =>
      Object.fromEntries(
        SEATS.map((seat) => [seat, { ...current[seat], modelId }]),
      ) as Record<Seat, SeatConfig>,
    );
  };

  const applyMatchup = (seatModels: Record<Seat, string>) => {
    setSeats((current) =>
      Object.fromEntries(
        SEATS.map((seat) => [seat, { ...current[seat], modelId: seatModels[seat] }]),
      ) as Record<Seat, SeatConfig>,
    );
  };

  const costTitle = (seatModels: Record<Seat, string>, note?: string) => {
    const cost = formatCost(estimateGameCostUsd(seatModels, toolModels) ?? undefined);
    return [note, cost ? t.perGame(cost) : null].filter(Boolean).join(" · ");
  };

  const availableMatchups = CODENAMES_MATCHUPS.filter((matchup) =>
    SEATS.every((seat) => toolModels.some((model) => model.id === matchup.seats[seat])),
  );

  const applyPreset = (preset: "same" | "teams" | "roles" | "cross") => {
    setSeats((current) => {
      const next = { ...current };
      if (preset === "same") {
        const model = current.red_spymaster.modelId;
        for (const seat of SEATS) next[seat] = { ...next[seat], modelId: model };
      } else if (preset === "teams") {
        next.red_operative = {
          ...next.red_operative,
          modelId: current.red_spymaster.modelId,
        };
        next.blue_operative = {
          ...next.blue_operative,
          modelId: current.blue_spymaster.modelId,
        };
      } else if (preset === "cross") {
        next.blue_spymaster = {
          ...next.blue_spymaster,
          modelId: current.red_operative.modelId,
        };
        next.blue_operative = {
          ...next.blue_operative,
          modelId: current.red_spymaster.modelId,
        };
      } else {
        next.blue_spymaster = {
          ...next.blue_spymaster,
          modelId: current.red_spymaster.modelId,
        };
        next.blue_operative = {
          ...next.blue_operative,
          modelId: current.red_operative.modelId,
        };
      }
      return next;
    });
  };

  const routeOf = (modelId: string) =>
    routeForModel(
      modelId,
      providerSettings.routing,
      (provider) => serverKeys[provider] || Boolean(providerSettings.keys[provider]),
    );

  const start = async () => {
    setError(null);
    const needsOpenRouter = SEATS.some(
      (seat) => !seats[seat].human && routeOf(seats[seat].modelId) === "openrouter",
    );
    if (needsOpenRouter && !hasServerKey && !apiKey.trim()) {
      setError(t.missingKey);
      onOpenSettings();
      return;
    }
    if (!seats || Object.values(seats).some((seat) => !seat.modelId)) {
      setError(t.missingModels);
      return;
    }
    setStarting(true);
    try {
      const response = await createCodenamesGame(
        {
          seed: seed === "" ? randomSeed() : seed,
          lang: locale,
          seats: withSupportedEfforts(seats, toolModels),
          speed,
          maxCostUsd: maxCost > 0 ? maxCost : null,
          providers: providerSettings.routing,
        },
        apiKey,
      );
      saveActiveGame(response.gameId);
      onStarted(response.gameId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t.createFailed);
    } finally {
      setStarting(false);
    }
  };

  const targetConfig = targetSeat ? seats[targetSeat] : null;
  const avatarSeatConfig = avatarSeat ? seats[avatarSeat] : null;

  return (
    <div className="relative z-10 mx-auto w-full max-w-6xl px-3 pb-16 pt-6 sm:px-6">
      <section className="glass animate-rise relative overflow-hidden rounded-3xl border p-5 sm:p-7">
        <span
          className="pointer-events-none absolute inset-0 opacity-70"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(ellipse at 15% 0%, color-mix(in oklab, var(--team-red) 22%, transparent), transparent 55%), radial-gradient(ellipse at 85% 10%, color-mix(in oklab, var(--team-blue) 22%, transparent), transparent 55%)",
          }}
        />
        <div className="relative flex flex-wrap items-center justify-between gap-5">
          <div className="min-w-0 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="animate-float grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-team-red via-accent to-team-blue text-white shadow-[0_12px_34px_-10px_var(--accent)]">
                <Gamepad2 size={20} />
              </span>
              <h1 className="text-gradient font-display text-[clamp(1.9rem,4.4vw,3rem)] font-bold uppercase leading-none tracking-[0.05em]">
                Models play Codenames
              </h1>
              <Badge tone="accent">v1</Badge>
            </div>
            <p className="mt-2.5 max-w-xl text-[14.5px] leading-relaxed text-muted">
              {t.heroText}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11.5px] text-faint">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas/60 px-2.5 py-1">
                <span className="live-dot !size-1.5 text-accent" />
                {historyLoading
                  ? t.loadingHistory
                  : t.savedGames(history.length)}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas/60 px-2.5 py-1">
                <Sparkles size={11} className="text-accent" />
                {modelsLoading
                  ? t.loadingCatalog
                  : t.toolModels(toolModels.length)}
              </span>
            </div>
            {/* A recorded real game: the quickest way to see the project, no key needed. */}
            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => onOpenGame(randomDemoId(locale), "replay")}
                className="btn-glow inline-flex h-9 items-center gap-1.5 rounded-xl bg-accent px-3.5 text-[13px] font-semibold text-accent-ink"
              >
                <Play size={14} />
                {t.watchDemo}
              </button>
              <span className="text-[11.5px] text-faint">{t.demoHint}</span>
            </div>
          </div>

          <HeroBoard />
        </div>
      </section>

      <section className="glass animate-rise mt-4 rounded-2xl border p-3 sm:p-4" style={{ animationDelay: "80ms" }}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-faint">
            <Wand2 size={12} />
            {t.presets}
          </span>
          <button
            type="button"
            onClick={() => applyPreset("same")}
            className="inline-flex items-center gap-1 rounded-full border border-line bg-canvas/70 px-2.5 py-1 text-[12.5px] font-medium text-ink-soft transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:text-ink"
          >
            <Copy size={11} />
            {t.sameModel}
          </button>
          <button
            type="button"
            onClick={() => applyPreset("teams")}
            className="inline-flex items-center gap-1 rounded-full border border-line bg-canvas/70 px-2.5 py-1 text-[12.5px] font-medium text-ink-soft transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:text-ink"
          >
            <Users size={11} />
            {t.redVsBlue}
          </button>
          <button
            type="button"
            onClick={() => applyPreset("roles")}
            className="inline-flex items-center gap-1 rounded-full border border-line bg-canvas/70 px-2.5 py-1 text-[12.5px] font-medium text-ink-soft transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:text-ink"
          >
            <Crown size={11} />
            {t.spymastersVsOperatives}
          </button>
          <button
            type="button"
            onClick={() => applyPreset("cross")}
            title={t.crossedTitle}
            className="inline-flex items-center gap-1 rounded-full border border-line bg-canvas/70 px-2.5 py-1 text-[12.5px] font-medium text-ink-soft transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:text-ink"
          >
            <Repeat2 size={11} />
            {t.crossed}
          </button>
        </div>

        {availableMatchups.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-[12px] font-medium text-faint">
              <Swords size={11} />
              {t.matchups}
            </span>
            {availableMatchups.map((matchup) => (
              <button
                key={matchup.id}
                type="button"
                onClick={() => applyMatchup(matchup.seats)}
                title={costTitle(matchup.seats)}
                className="rounded-full border border-line bg-canvas/70 px-2 py-0.5 text-[11.5px] font-medium text-ink-soft transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:text-ink"
              >
                {matchup.label[locale]}
              </button>
            ))}
          </div>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[12px] font-medium text-faint">
            <Sparkles size={11} />
            {t.exampleModels}
          </span>
          {CODENAMES_EXAMPLE_MODELS.filter((preset) =>
            toolModels.some((model) => model.id === preset.id),
          ).map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyToAll(preset.id)}
              title={costTitle(
                {
                  red_spymaster: preset.id,
                  red_operative: preset.id,
                  blue_spymaster: preset.id,
                  blue_operative: preset.id,
                },
                preset.note,
              )}
              className="rounded-full border border-accent/25 bg-accent-soft px-2 py-0.5 text-[11.5px] font-medium text-accent transition-all hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-[0_6px_18px_-8px_var(--accent)]"
            >
              {preset.label}
            </button>
          ))}
          <span className="text-[11.5px] text-faint">
            {modelsLoading
              ? t.loadingCatalogEllipsis
              : t.toolModels(toolModels.length)}
          </span>
        </div>
      </section>

      {(error || modelsError || warning) && (
        <div className="mt-3 space-y-1.5">
          {error && (
            <p className="rounded-xl border border-danger/30 bg-danger/5 px-3 py-2 text-[13px] text-danger">
              {error}
            </p>
          )}
          {modelsError && (
            <p className="rounded-xl border border-danger/30 bg-danger/5 px-3 py-2 text-[13px] text-danger">
              {modelsError}
            </p>
          )}
          {warning && (
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[13px] text-amber-700 dark:text-amber-300">
              {warning}
            </p>
          )}
        </div>
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {SEATS.map((seat) => (
          <SeatEditor
            key={seat}
            seat={seat}
            config={seats[seat]}
            model={toolModels.find((model) => model.id === seats[seat].modelId)}
            onChange={(patch) => updateSeat(seat, patch)}
            onPickModel={() => setTargetSeat(seat)}
            onPickAvatar={() => setAvatarSeat(seat)}
            via={routeOf(seats[seat].modelId)}
            onToggleHuman={() =>
              setSeats((current) => {
                const enable = !current[seat].human;
                return Object.fromEntries(
                  SEATS.map((candidate) => [
                    candidate,
                    { ...current[candidate], human: enable && candidate === seat },
                  ]),
                ) as Record<Seat, SeatConfig>;
              })
            }
          />
        ))}
      </div>

      <section className="glass animate-rise mt-4 rounded-2xl border p-3 sm:p-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
          <div>
            <label className="text-[13px] font-semibold uppercase tracking-wider text-faint">
              {t.seed}
            </label>
            <div className="mt-1 flex items-center gap-1.5">
              <input
                type="number"
                value={seed}
                onChange={(event) =>
                  setSeed(event.target.value === "" ? "" : Number(event.target.value))
                }
                placeholder={t.random}
                aria-label={t.seedLabel}
                className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-canvas px-2.5 text-[14px] tabular-nums outline-none focus:border-accent/60"
              />
              <IconButton
                label={t.randomSeed}
                onClick={() => setSeed(randomSeed())}
              >
                <Dices size={15} />
              </IconButton>
            </div>
            <p className="mt-1 text-[11.5px] text-faint">
              {t.seedHelp}
            </p>
          </div>

          <div>
            <label className="text-[13px] font-semibold uppercase tracking-wider text-faint">
              {t.initialSpeed}
            </label>
            <div className="mt-1">
              <Segmented
                ariaLabel={t.initialSpeed}
                value={String(speed)}
                onChange={(value) => setSpeed(Number(value))}
                options={[0.25, 0.5, 1, 2].map((value) => ({
                  value: String(value),
                  label: `${value}×`,
                }))}
              />
            </div>
          </div>

          <div>
            <label className="text-[13px] font-semibold uppercase tracking-wider text-faint">
              {t.costCap}
            </label>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="text-[14px] text-muted">$</span>
              <input
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={maxCost}
                onChange={(event) => setMaxCost(Number(event.target.value))}
                aria-label={t.costCapLabel}
                className="h-9 w-full rounded-lg border border-line bg-canvas px-2.5 text-[14px] tabular-nums outline-none focus:border-accent/60"
              />
            </div>
            <p className="mt-1 text-[11.5px] text-faint">{t.noLimit}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch
                label={t.godMode}
                checked={godMode}
                onChange={(value) => {
                  setGodMode(value);
                  saveGodMode(value);
                }}
              />
              <span className="inline-flex items-center gap-1 text-[12.5px] text-ink-soft">
                <Eye size={11} />
                {t.godMode}
              </span>
            </div>
            <span className="hidden text-[11.5px] text-faint sm:inline">
              {t.godModeHelp}
            </span>
          </div>

          <button
            type="button"
            onClick={() => void start()}
            disabled={starting || modelsLoading || toolModels.length === 0}
            className="btn-glow btn-shine inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-5 text-[14px] font-semibold text-accent-ink disabled:pointer-events-none disabled:opacity-40"
          >
            {starting ? (
              <LoaderCircle size={15} className="animate-spin" />
            ) : (
              <Play size={15} />
            )}
            {starting ? t.preparing : t.startGame}
          </button>
        </div>
      </section>

      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="inline-flex items-center gap-1.5 font-display text-[14px] font-semibold uppercase tracking-[0.18em] text-muted">
            <History size={12} />
            {t.recentGames}
          </h2>
          {source === "fallback" && (
            <span className="text-[11.5px] text-amber-600 dark:text-amber-300">
              {t.referenceCatalog}
            </span>
          )}
        </div>

        {historyLoading ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="h-20 animate-pulse rounded-xl border border-line bg-panel"
              />
            ))}
          </div>
        ) : history.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-[13px] text-faint">
            {t.noGames}
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {history.slice(0, 9).map((game) => {
              const red = game.config.seats.red_spymaster;
              const blue = game.config.seats.blue_spymaster;
              const redModel = models.find((model) => model.id === red.modelId);
              const blueModel = models.find((model) => model.id === blue.modelId);
              const finished =
                game.status === "finished" || game.status === "aborted";
              const winnerColor =
                game.winner === "red"
                  ? "var(--team-red)"
                  : game.winner === "blue"
                    ? "var(--team-blue)"
                    : "var(--line-strong)";
              return (
                <div
                  key={game.id}
                  className="lift group relative flex flex-col overflow-hidden rounded-xl border border-line bg-panel/60 p-3 hover:border-accent/30"
                >
                  <span
                    className="absolute inset-y-0 left-0 w-[3px]"
                    style={{ background: winnerColor, opacity: 0.8 }}
                    aria-hidden="true"
                  />
                  <div className="flex items-center justify-between gap-2 pl-1.5">
                    <span className="truncate font-display text-[15px] font-semibold uppercase tracking-wide text-ink">
                      {t.seedN(game.seed)}
                    </span>
                    <Badge
                      tone={
                        game.status === "aborted"
                          ? "amber"
                          : finished
                            ? "neutral"
                            : "accent"
                      }
                    >
                      {game.status === "finished"
                        ? game.winner === "draw"
                          ? t.draw
                          : t.wins(
                              game.winner === "red" || game.winner === "blue"
                                ? t.team(game.winner)
                                : "?",
                            )
                        : game.status === "paused"
                          ? t.paused
                          : game.status === "aborted"
                            ? t.aborted
                            : t.inProgress}
                    </Badge>
                  </div>
                  <p className="mt-1 truncate text-[11.5px] text-muted">
                    {t.turns(game.turnsPlayed)} · {t.redShort}:{" "}
                    {modelDisplayName(redModel?.name ?? red.modelId)}
                  </p>
                  <p className="truncate text-[11.5px] text-muted">
                    {t.blueShort}: {modelDisplayName(blueModel?.name ?? blue.modelId)}
                  </p>
                  <div className="mt-2 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onOpenGame(game.id, "replay")}
                      className="inline-flex items-center gap-1 rounded-lg border border-line bg-elevated px-2.5 py-1.5 text-[12.5px] font-medium text-ink-soft transition-all hover:border-accent/40 hover:text-accent"
                    >
                      <Play size={12} />
                      {t.replay}
                    </button>
                    {!finished && (
                      <button
                        type="button"
                        onClick={() => onOpenGame(game.id, "live")}
                        className="inline-flex items-center gap-1 rounded-lg border border-accent/30 bg-accent-soft px-2.5 py-1.5 text-[12.5px] font-semibold text-accent transition-all hover:brightness-110"
                      >
                        <Gamepad2 size={12} />
                        {t.open}
                      </button>
                    )}
                    {game.metrics?.costUsd ? (
                      <span className="ml-auto text-[12px] text-faint">
                        {formatCost(game.metrics.costUsd)}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <ModelPicker
        open={targetSeat !== null}
        onClose={() => setTargetSeat(null)}
        models={toolModels}
        selectedId={targetConfig?.modelId ?? ""}
        loading={modelsLoading}
        source={source}
        warning={warning}
        error={modelsError}
        title={
          targetConfig
            ? t.modelFor(targetConfig.displayName)
            : t.chooseModel
        }
        subtitle={t.onlyToolModels}
        onSelect={(id) => {
          if (targetSeat) updateSeat(targetSeat, { modelId: id });
          setTargetSeat(null);
        }}
        onRefresh={onRefreshModels}
      />

      <Modal
        open={avatarSeat !== null}
        onClose={() => setAvatarSeat(null)}
        label={t.chooseAvatar}
      >
        <div className="p-4">
          <h2 className="text-[16px] font-semibold">{t.chooseAvatar}</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            {avatarSeatConfig ? avatarSeatConfig.displayName : ""}
          </p>
          <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
            {AVATARS.map((avatar) => {
              const selected = avatarSeatConfig?.avatarId === avatar.id;
              return (
                <button
                  key={avatar.id}
                  type="button"
                  onClick={() => {
                    if (!avatarSeat) return;
                    const previous = avatarById(
                      seats[avatarSeat].avatarId,
                    );
                    const currentName = seats[avatarSeat].displayName;
                    updateSeat(avatarSeat, {
                      avatarId: avatar.id,
                      ...(previous &&
                      (currentName === previous.name ||
                        currentName === previous.nameEn)
                        ? { displayName: avatarName(avatar, locale) }
                        : {}),
                    });
                    setAvatarSeat(null);
                  }}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-xl border p-2 transition-colors",
                    selected
                      ? "border-accent/50 bg-accent-soft"
                      : "border-line hover:bg-hover",
                  )}
                >
                  <Avatar
                    avatar={avatar}
                    team={avatarSeat ? teamOfSeat(avatarSeat) : null}
                    size={40}
                  />
                  <span className="text-[12px] text-muted">{avatarName(avatar, locale)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </Modal>
    </div>
  );
}
