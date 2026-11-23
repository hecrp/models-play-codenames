"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  ChevronLeft,
  Coins,
  Eye,
  Gamepad2,
  Pause,
  Play,
  RotateCcw,
  ScrollText,
  SkipForward,
  Skull,
  Sparkles,
  StepForward,
  Target,
  Timer,
  Trophy,
  X,
} from "lucide-react";
import type { GameConfig, GameState, Seat, StoredGameEvent } from "@/lib/codenames/types";
import { createCodenamesGame, saveActiveGame, loadGodMode, saveGodMode } from "@/lib/codenames/client-api";
import { computeMetrics } from "@/lib/codenames/metrics";
import { cn, formatCost, formatTokens } from "@/lib/utils";
import { useStrings, type Locale } from "@/lib/i18n";
import { Badge, Modal } from "@/components/ui";
import { useCodenamesGame } from "@/hooks/use-codenames-game";
import { useCodenamesReplay } from "@/hooks/use-codenames-replay";
import type { Theme } from "@/lib/themes";
import { Board } from "./board";
import { Confetti, ThemeMenu } from "./effects";
import { GameControls, ClueBanner } from "./game-controls";
import { GameLog } from "./game-log";
import { HumanPanel, useHumanActions } from "./human-panel";
import { LocaleSwitch } from "./locale-switch";
import { TeamPanel, type ClueItem } from "./team-panel";
import type { BoardFocus } from "./board";
import { pendingThinker } from "@/lib/codenames/replay";

interface GameScreenProps {
  gameId: string;
  mode: "live" | "replay";
  apiKey: string;
  hasServerKey: boolean;
  onExit: () => void;
  onReplay: () => void;
  onNewGame: () => void;
  onStarted: (gameId: string) => void;
  onOpenRules: () => void;
  onOpenSettings: () => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
}

const ES = {
  reasons: {
    all_cards: "todas las cartas reveladas",
    assassin: "el asesino",
    turn_limit: "límite de 40 turnos",
    aborted: "partida abortada",
    cost_limit: "tope de coste alcanzado",
    error: "error del modelo",
  } as Record<string, string>,
  teams: { red: "rojo", blue: "azul" },
  draw: "Tablas",
  wins: (team: string) => `Gana ${team}`,
  gameOver: "Partida terminada",
  cost: "Coste",
  tokens: "Tokens",
  latency: "Latencia",
  illegalClues: "Pistas ilegales",
  precision: "Precisión",
  stops: "Plantadas",
  seats: "Asientos",
  redInitial: "R",
  blueInitial: "A",
  setup: "Configurar",
  replayPrefix: "Replay · ",
  seed: "Semilla",
  replay: "Replay",
  paused: "Pausada",
  inPlay: "En juego",
  aborted: "Abortada",
  finished: "Finalizada",
  rules: "Reglas",
  log: "Registro",
  openLog: "Abrir el registro de la partida",
  closeLog: "Cerrar el registro",
  newGame: "Nueva partida",
  manualMode: "Modo manual",
  manualHint: "La partida avanza solo cuando tú lo indicas.",
  nextMove: "Siguiente jugada",
  endTurn: "Terminar turno",
  automatic: "Automático",
  replayPosition: "Posición del replay",
  event: "evento",
  endOfGame: "Fin de la partida",
  gameFinished: "Partida finalizada",
  turns: (n: number) => `${n} turnos`,
  closeSummary: "Cerrar resumen",
  watchReplay: "Ver replay",
  watchAgain: "Volver a ver",
  rematch: "Revancha con colores cambiados",
  summary: (m: {
    clues: number;
    guesses: number;
    own: number;
    opponent: number;
    neutral: number;
    assassin: number;
  }) =>
    `${m.clues} pistas · ${m.guesses} adivinanzas · ${m.own} propias · ${m.opponent} rivales · ${m.neutral} neutrales · ${m.assassin} asesino`,
  openSettings: "Abrir ajustes",
  loadingGame: "Cargando partida…",
  loadingReplay: "Cargando replay…",
  backToSetup: "Volver a configurar",
  demoNotice: (models: string) =>
    `Partida de demostración: la jugaron de verdad ${models} y está grabada, así que no gasta nada.`,
  demoCta: "Configura la tuya",
};

const STRINGS: Record<Locale, typeof ES> = {
  es: ES,
  en: {
    reasons: {
      all_cards: "all cards revealed",
      assassin: "the assassin",
      turn_limit: "40-turn limit",
      aborted: "game aborted",
      cost_limit: "cost cap reached",
      error: "model error",
    },
    teams: { red: "red", blue: "blue" },
    draw: "Draw",
    wins: (team) => `${team} wins`,
    gameOver: "Game over",
    cost: "Cost",
    tokens: "Tokens",
    latency: "Latency",
    illegalClues: "Illegal clues",
    precision: "Precision",
    stops: "Stops",
    seats: "Seats",
    redInitial: "R",
    blueInitial: "B",
    setup: "Setup",
    replayPrefix: "Replay · ",
    seed: "Seed",
    replay: "Replay",
    paused: "Paused",
    inPlay: "In play",
    aborted: "Aborted",
    finished: "Finished",
    rules: "Rules",
    log: "Log",
    openLog: "Open the game log",
    closeLog: "Close the log",
    newGame: "New game",
    manualMode: "Manual mode",
    manualHint: "The game only advances when you say so.",
    nextMove: "Next move",
    endTurn: "End turn",
    automatic: "Automatic",
    replayPosition: "Replay position",
    event: "event",
    endOfGame: "Game over",
    gameFinished: "Game finished",
    turns: (n) => `${n} turns`,
    closeSummary: "Close summary",
    watchReplay: "Watch replay",
    watchAgain: "Watch again",
    rematch: "Rematch with swapped colors",
    summary: (m) =>
      `${m.clues} clues · ${m.guesses} guesses · ${m.own} own · ${m.opponent} opponent · ${m.neutral} neutral · ${m.assassin} assassin`,
    openSettings: "Open settings",
    loadingGame: "Loading game…",
    loadingReplay: "Loading replay…",
    backToSetup: "Back to setup",
    demoNotice: (models: string) =>
      `Demo game: really played by ${models} and recorded, so it costs nothing.`,
    demoCta: "Set up your own",
  },
};

type Strings = typeof ES;

export function DealingLoader() {
  const colors = [
    "var(--card-red)",
    "var(--card-blue)",
    "var(--card-neutral)",
    "var(--card-face)",
    "var(--card-red)",
    "var(--card-blue)",
    "var(--card-face)",
    "var(--card-neutral)",
    "var(--card-assassin)",
  ];
  return (
    <div className="grid grid-cols-3 gap-1.5" style={{ perspective: 600 }} aria-hidden="true">
      {colors.map((color, index) => (
        <span
          key={index}
          className="mini-card relative block h-6 w-9"
          style={{ "--i": index } as React.CSSProperties}
        >
          <span
            className="border border-line-strong"
            style={{ background: "linear-gradient(160deg,var(--card-face),var(--card-face-2))" }}
          />
          <span style={{ background: color }} />
        </span>
      ))}
    </div>
  );
}

function winnerText(state: GameState, t: Strings): string {
  if (state.winner === "draw") return t.draw;
  if (state.winner) return t.wins(t.teams[state.winner]);
  return t.gameOver;
}

function MetricsPanel({
  state,
  events,
  config,
}: {
  state: GameState;
  events: StoredGameEvent[];
  config: GameConfig;
}) {
  const t = useStrings(STRINGS);
  const metrics = useMemo(() => computeMetrics(events), [events]);
  const precision =
    metrics.guesses > 0
      ? Math.round((metrics.ownGuesses / metrics.guesses) * 100)
      : 0;

  const items = [
    { label: t.cost, value: formatCost(metrics.costUsd) ?? "$0", icon: Coins },
    {
      label: t.tokens,
      value: formatTokens(
        metrics.promptTokens + metrics.completionTokens,
      ),
      icon: Sparkles,
    },
    { label: t.latency, value: `${(metrics.latencyMs / 1000).toFixed(1)} s`, icon: Timer },
    { label: t.illegalClues, value: `${metrics.illegalAttempts}`, icon: Target },
    { label: t.precision, value: `${precision}%`, icon: Eye },
    { label: t.stops, value: `${metrics.stops}`, icon: RotateCcw },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <div
            key={item.label}
            className="animate-rise lift rounded-xl border border-line bg-panel/70 px-3 py-2.5"
            style={{ animationDelay: `${150 + index * 60}ms` }}
          >
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
              <Icon size={11} className="text-accent" />
              {item.label}
            </div>
            <p className="mt-1 font-display text-[22px] font-semibold leading-none tabular-nums text-ink">
              {item.value}
            </p>
          </div>
        );
      })}
      <div
        className="animate-rise col-span-2 rounded-xl border border-line bg-panel/70 px-3 py-2.5 sm:col-span-3"
        style={{ animationDelay: "520ms" }}
      >
        <p className="text-[12px] uppercase tracking-wide text-faint">{t.seats}</p>
        <div className="mt-1 grid gap-1 text-[12px] text-muted sm:grid-cols-2">
          {config.seats.red_spymaster && (
            <span className="truncate">
              <span className="font-bold text-team-red-ink">{t.redInitial}</span>{" "}
              {config.seats.red_spymaster.displayName}:{" "}
              {config.seats.red_spymaster.modelId}
            </span>
          )}
          {config.seats.blue_spymaster && (
            <span className="truncate">
              <span className="font-bold text-team-blue-ink">{t.blueInitial}</span>{" "}
              {config.seats.blue_spymaster.displayName}:{" "}
              {config.seats.blue_spymaster.modelId}
            </span>
          )}
          {config.seats.red_operative && (
            <span className="truncate">
              <span className="font-bold text-team-red-ink">{t.redInitial}</span>{" "}
              {config.seats.red_operative.displayName}:{" "}
              {config.seats.red_operative.modelId}
            </span>
          )}
          {config.seats.blue_operative && (
            <span className="truncate">
              <span className="font-bold text-team-blue-ink">{t.blueInitial}</span>{" "}
              {config.seats.blue_operative.displayName}:{" "}
              {config.seats.blue_operative.modelId}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function GameView({
  mode,
  gameId,
  state,
  events,
  config,
  paused,
  speed,
  godMode,
  connection,
  thinking,
  recentGuess,
  metricsEvents,
  onToggleGod,
  onTogglePlay,
  onStep,
  onAbort,
  onRestart,
  onSpeed,
  onExit,
  onReplay,
  onNewGame,
  onRematch,
  onSeek,
  cursor,
  totalEvents,
  finished,
  error,
  onOpenRules,
  onOpenSettings,
  theme,
  onThemeChange,
  onStepTurn,
  human,
  notice,
}: {
  /** Extra banner above the board (the demo explains itself here). */
  notice?: React.ReactNode;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onStepTurn?: () => void;
  human?: { seat: Seat; apiKey: string };
  mode: "live" | "replay";
  gameId: string;
  state: GameState;
  events: StoredGameEvent[];
  config: GameConfig;
  paused: boolean;
  speed: number;
  godMode: boolean;
  connection: "connecting" | "live" | "reconnecting" | "closed" | "error";
  thinking: import("@/lib/codenames/types").Seat | null;
  recentGuess: string | null;
  metricsEvents: StoredGameEvent[];
  onToggleGod: () => void;
  onTogglePlay: () => void;
  onStep: () => void;
  onAbort?: () => void;
  onRestart?: () => void;
  onSpeed: (speed: number) => void;
  onExit: () => void;
  onReplay?: () => void;
  onNewGame: () => void;
  onRematch?: () => void;
  onSeek?: (value: number) => void;
  cursor?: number;
  totalEvents?: number;
  finished: boolean;
  error: string | null;
  onOpenRules: () => void;
  onOpenSettings: () => void;
}) {
  const t = useStrings(STRINGS);
  const [dismissedEnd, setDismissedEnd] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  // Intent vs outcome: only once the game is over or in a replay, so a live
  // spectator is not told what the spymaster is aiming at.
  const showIntent = mode === "replay" || finished;
  const [focus, setFocus] = useState<(BoardFocus & { id: string }) | null>(null);
  const focusClue = (clue: ClueItem | null) =>
    setFocus(
      clue && clue.targets
        ? { id: clue.id, team: clue.seat.startsWith("red") ? "red" : "blue", clue: clue.word, targets: clue.targets }
        : null,
    );
  // Drop the focus when its clue is no longer shown (replay rewound) or intent is hidden.
  const focusVisible =
    focus !== null && showIntent && events.some((event) => String(event.id) === focus.id);
  useEffect(() => {
    if (!focus) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFocus(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focus]);
  const headerRef = useRef<HTMLElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const observer = new ResizeObserver(() => setHeaderHeight(header.offsetHeight));
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!logOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLogOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [logOpen]);
  const humanActions = useHumanActions(gameId);
  useEffect(() => {
    setDismissedEnd(false);
  }, [gameId]);
  // A person at the table sees only what their role allows: no god mode.
  const humanLive = human && !finished ? human : undefined;
  const effectiveGod = humanLive ? humanLive.seat.endsWith("spymaster") : godMode;
  const awaitingHuman = humanLive !== undefined && thinking === humanLive.seat;
  // A human operative hears the clue alone, as at a real table.
  const hideAsides = humanLive !== undefined && humanLive.seat.endsWith("operative");
  const canPick =
    awaitingHuman && humanLive.seat.endsWith("operative") && !humanActions.busy;
  const manual = mode === "live" && paused && !finished;
  const lastError =
    error ??
    [...events]
      .reverse()
      .find((event) => event.type === "agent_error")?.data.message ??
    null;
  const showEnd = finished && !dismissedEnd;
  const endMetrics = useMemo(
    () => computeMetrics(metricsEvents.length > 0 ? metricsEvents : events),
    [events, metricsEvents],
  );

  const winnerColor =
    state.winner === "red"
      ? "var(--team-red)"
      : state.winner === "blue"
        ? "var(--team-blue)"
        : "var(--accent)";
  const winnerInk =
    state.winner === "red"
      ? "var(--team-red-ink)"
      : state.winner === "blue"
        ? "var(--team-blue-ink)"
        : "var(--ink)";
  const confettiColors = useMemo(
    () =>
      state.winner === "red"
        ? ["var(--team-red)", "var(--team-red-ink)", "var(--accent)", "#ffd166", "#ffffff"]
        : state.winner === "blue"
          ? ["var(--team-blue)", "var(--team-blue-ink)", "var(--accent)", "#ffd166", "#ffffff"]
          : ["var(--team-red)", "var(--team-blue)", "var(--accent)", "#ffd166"],
    [state.winner],
  );
  const celebrate =
    showEnd && (state.winner === "red" || state.winner === "blue");

  const rematch = async () => {
    if (!onRematch) return;
    onRematch();
  };

  return (
    <div className="relative z-10 flex min-h-dvh flex-col text-ink lg:h-dvh lg:overflow-hidden">
      <header ref={headerRef} className="glass relative z-20 flex shrink-0 flex-wrap items-center gap-2 border-0 border-b px-2 py-2 sm:px-4">
        <button
          type="button"
          onClick={onExit}
          className="inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-[13px] text-muted transition-colors hover:bg-hover hover:text-ink"
        >
          <ChevronLeft size={15} />
          <span className="hidden sm:inline">{t.setup}</span>
        </button>
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-team-red via-accent to-team-blue text-white shadow-[0_6px_20px_-6px_var(--accent)]">
            <Gamepad2 size={15} />
          </span>
          <div className="min-w-0">
            <h1 className="text-gradient truncate font-display text-[18px] font-semibold uppercase tracking-[0.12em]">
              Models play Codenames
            </h1>
            <div className="flex items-center gap-2 text-[11.5px] text-muted">
              <span className="truncate">
                {mode === "replay" ? t.replayPrefix : ""}{t.seed}{" "}
                <span className="font-mono">{state.seed}</span>
              </span>
              <span className="hidden h-1 w-16 overflow-hidden rounded-full bg-line-strong/60 sm:block">
                <span
                  className="block h-full rounded-full bg-accent transition-all duration-700"
                  style={{ width: `${Math.min(100, (state.turnsPlayed / 40) * 100)}%` }}
                />
              </span>
              <span className="tabular-nums">{state.turnsPlayed}/40</span>
            </div>
          </div>
        </div>
        <GameControls
          mode={mode}
          paused={paused}
          speed={speed}
          godMode={effectiveGod}
          godLocked={humanLive !== undefined}
          connection={connection}
          disabled={finished && mode === "live"}
          onTogglePlay={onTogglePlay}
          onStep={onStep}
          onAbort={onAbort}
          onRestart={onRestart}
          onSpeed={onSpeed}
          onToggleGod={onToggleGod}
          className="order-last w-full justify-center lg:order-none lg:w-auto lg:flex-1"
        />
        <div className="ml-auto flex items-center gap-1 lg:ml-0">
          <ThemeMenu theme={theme} onChange={onThemeChange} />
          <LocaleSwitch />
          <Badge
            tone={
              state.status === "aborted"
                ? "amber"
                : state.status === "finished"
                  ? "neutral"
                  : "accent"
            }
          >
            {mode === "replay"
              ? t.replay
              : state.status === "in_progress"
                ? paused
                  ? t.paused
                  : t.inPlay
                : state.status === "paused"
                  ? t.paused
                  : state.status === "aborted"
                    ? t.aborted
                    : t.finished}
          </Badge>
          <button
            type="button"
            onClick={() => setLogOpen((value) => !value)}
            aria-pressed={logOpen}
            aria-label={logOpen ? t.closeLog : t.openLog}
            title={logOpen ? t.closeLog : t.openLog}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-medium transition-colors",
              logOpen
                ? "border-accent/50 bg-accent-soft text-accent"
                : "border-line bg-panel text-ink-soft hover:bg-hover hover:text-ink",
            )}
          >
            <ScrollText size={14} />
            <span className="hidden sm:inline">{t.log}</span>
          </button>
          <button
            type="button"
            onClick={onOpenRules}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 text-[12.5px] font-medium text-ink-soft transition-colors hover:bg-hover hover:text-ink"
          >
            <BookOpen size={14} />
            <span className="hidden sm:inline">{t.rules}</span>
          </button>
          {mode === "live" && (
            <button
              type="button"
              onClick={onNewGame}
              className="hidden h-9 items-center rounded-lg border border-line bg-panel px-2.5 text-[12.5px] text-ink-soft transition-colors hover:bg-hover sm:inline-flex"
            >
              {t.newGame}
            </button>
          )}
        </div>
      </header>

      <div className="flex shrink-0 flex-wrap items-center gap-2 px-2 pt-2 sm:px-4">
        {notice}
        <ClueBanner
          team={state.turn.team}
          phase={state.turn.phase}
          clue={
            hideAsides && state.turn.clue
              ? { word: state.turn.clue.word, number: state.turn.clue.number }
              : state.turn.clue
          }
          guessesLeft={state.turn.guessesLeft}
          turn={state.turnsPlayed}
          lastError={lastError}
        />
        {manual && (
          <div className="glass flex w-full flex-wrap items-center gap-2 rounded-2xl border border-accent/30 px-3 py-2">
            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-accent">
              <Pause size={13} />
              {t.manualMode}
            </span>
            <span className="hidden text-[12px] text-muted sm:inline">
              {t.manualHint}
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={onStep}
                className="btn-glow inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[12.5px] font-semibold text-accent-ink"
              >
                <StepForward size={13} />
                {t.nextMove}
              </button>
              {onStepTurn && (
                <button
                  type="button"
                  onClick={onStepTurn}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-elevated px-3 text-[12.5px] font-medium text-ink-soft transition-colors hover:bg-hover"
                >
                  <SkipForward size={13} />
                  {t.endTurn}
                </button>
              )}
              <button
                type="button"
                onClick={onTogglePlay}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-elevated px-3 text-[12.5px] font-medium text-ink-soft transition-colors hover:bg-hover"
              >
                <Play size={13} />
                {t.automatic}
              </button>
            </div>
          </div>
        )}
        {awaitingHuman && humanLive && (
          <HumanPanel
            gameId={gameId}
            apiKey={humanLive.apiKey}
            seat={humanLive.seat}
            state={state}
            actions={humanActions}
          />
        )}
      </div>

      <main className="grid min-h-0 flex-1 grid-cols-1 content-start gap-2.5 overflow-y-auto px-2 py-2.5 sm:grid-cols-2 sm:px-4 lg:grid-cols-[minmax(210px,1fr)_minmax(0,min(880px,calc((100dvh-220px)*1.43)))_minmax(210px,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
        <div className="order-1 col-span-full flex min-h-0 w-full items-start justify-center lg:order-none lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:items-center">
          <Board
            cards={state.board}
            godMode={effectiveGod}
            highlightWord={recentGuess}
            focus={focusVisible ? focus : null}
            onPick={
              canPick
                ? (card) => void humanActions.send({ type: "guess", word: card.word })
                : undefined
            }
          />
        </div>

        <TeamPanel
          team="red"
          configs={config.seats}
          state={state}
          thinking={thinking}
          events={events}
          showIntent={showIntent}
          hideAsides={hideAsides}
          focusedClueId={focusVisible ? focus?.id : null}
          onFocusClue={focusClue}
          className="order-2 lg:order-none lg:col-start-1 lg:row-start-1"
        />
        <TeamPanel
          team="blue"
          configs={config.seats}
          state={state}
          thinking={thinking}
          events={events}
          showIntent={showIntent}
          hideAsides={hideAsides}
          focusedClueId={focusVisible ? focus?.id : null}
          onFocusClue={focusClue}
          className="order-3 lg:order-none lg:col-start-3 lg:row-start-1"
        />
      </main>

      {logOpen && (
        <div
          className="animate-slide-in fixed bottom-0 right-0 z-30 flex w-full max-w-[420px] p-2 sm:p-3"
          style={{ top: headerHeight }}
        >
          <GameLog
            events={events}
            config={config}
            onClose={() => setLogOpen(false)}
            className="glass-strong h-full w-full"
          />
        </div>
      )}

      {mode === "replay" && onSeek && totalEvents !== undefined && (
        <div className="glass relative z-10 flex shrink-0 items-center gap-3 border-0 border-t px-4 py-2">
          <span className="rounded-full bg-accent-soft px-2 py-0.5 font-mono text-[11.5px] tabular-nums text-accent">
            {cursor ?? 1}/{totalEvents}
          </span>
          <input
            type="range"
            min={1}
            max={Math.max(1, totalEvents)}
            value={cursor ?? 1}
            onChange={(event) => onSeek(Number(event.target.value))}
            aria-label={t.replayPosition}
            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-line-strong accent-accent"
          />
          <span className="text-[11.5px] text-faint">
            {mode === "replay" ? t.event : ""}
          </span>
        </div>
      )}

      {celebrate && <Confetti key={gameId} colors={confettiColors} />}

      <Modal
        open={showEnd}
        onClose={() => setDismissedEnd(true)}
        label={t.endOfGame}
        className="sm:max-w-xl"
      >
        <div className="relative max-h-[calc(92dvh-1rem)] overflow-y-auto p-5">
          <span
            className="pointer-events-none absolute inset-x-0 top-0 h-40"
            style={{
              background: `radial-gradient(ellipse at 30% 0%, color-mix(in oklab, ${winnerColor} 35%, transparent), transparent 70%)`,
            }}
            aria-hidden="true"
          />
          <div className="relative flex items-start gap-4">
            <span
              className="animate-trophy relative grid size-16 shrink-0 place-items-center rounded-2xl border text-white"
              style={{
                background: `linear-gradient(150deg, ${winnerColor}, color-mix(in oklab, ${winnerColor} 55%, black))`,
                borderColor: `color-mix(in oklab, ${winnerColor} 60%, white)`,
                boxShadow: `0 14px 40px -10px ${winnerColor}`,
              }}
            >
              <span
                className="animate-spin-slow absolute -inset-3 -z-10 rounded-full opacity-60"
                style={{
                  background: `conic-gradient(from 0deg, transparent, ${winnerColor}, transparent 30%, ${winnerColor}, transparent 60%, ${winnerColor}, transparent 90%)`,
                  filter: "blur(10px)",
                }}
                aria-hidden="true"
              />
              {state.winReason === "assassin" ? <Skull size={28} /> : <Trophy size={28} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-faint">
                {t.endOfGame}
              </p>
              <h2
                className="animate-clue-in font-display text-[34px] font-bold uppercase leading-tight tracking-[0.06em]"
                style={{ color: winnerInk, textShadow: `0 0 30px ${winnerColor}` }}
              >
                {winnerText(state, t)}
              </h2>
              <p className="mt-0.5 text-[13.5px] text-muted">
                {state.winReason
                  ? t.reasons[state.winReason] ?? state.winReason
                  : t.gameFinished}
                {" · "}
                {t.turns(state.turnsPlayed)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDismissedEnd(true)}
              aria-label={t.closeSummary}
              className="rounded-lg p-1.5 text-muted transition-colors hover:bg-hover hover:text-ink"
            >
              <X size={16} />
            </button>
          </div>

          <div className="relative mt-5">
            <MetricsPanel state={state} events={metricsEvents} config={config} />
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            {mode === "live" && onReplay && (
              <button
                type="button"
                onClick={onReplay}
                className="rounded-lg border border-line bg-elevated px-3 py-1.5 text-[13px] font-medium text-ink transition-colors hover:bg-hover"
              >
                {t.watchReplay}
              </button>
            )}
            {mode === "replay" && onRestart && (
              <button
                type="button"
                onClick={() => {
                  onRestart();
                  setDismissedEnd(true);
                }}
                className="rounded-lg border border-line bg-elevated px-3 py-1.5 text-[13px] font-medium text-ink transition-colors hover:bg-hover"
              >
                {t.watchAgain}
              </button>
            )}
            {mode === "live" && onRematch && (
              <button
                type="button"
                onClick={() => void rematch()}
                className="rounded-lg border border-accent/30 bg-accent-soft px-3 py-1.5 text-[13px] font-semibold text-accent transition-opacity hover:opacity-80"
              >
                {t.rematch}
              </button>
            )}
            <button
              type="button"
              onClick={onNewGame}
              className="btn-glow btn-shine rounded-lg bg-accent px-4 py-1.5 text-[13px] font-semibold text-accent-ink"
            >
              {t.newGame}
            </button>
          </div>

          <p className="mt-3 text-[12px] text-faint">
            {t.summary({
              clues: endMetrics.clues,
              guesses: endMetrics.guesses,
              own: endMetrics.ownGuesses,
              opponent: endMetrics.opponentGuesses,
              neutral: endMetrics.neutralGuesses,
              assassin: endMetrics.assassinGuesses,
            })}
            {" · "}
            {gameId.slice(0, 10)}
          </p>
        </div>
      </Modal>

      {error && (
        <button
          type="button"
          onClick={onOpenSettings}
          className="fixed bottom-3 left-1/2 z-30 max-w-[90vw] -translate-x-1/2 rounded-full border border-danger/30 bg-danger/10 px-3 py-1.5 text-[12.5px] text-danger shadow-lg backdrop-blur"
        >
          {error} · {t.openSettings}
        </button>
      )}
    </div>
  );
}

function LiveGame({
  gameId,
  apiKey,
  onExit,
  onReplay,
  onNewGame,
  onStarted,
  onOpenRules,
  onOpenSettings,
  theme,
  onThemeChange,
}: Omit<GameScreenProps, "mode" | "hasServerKey">) {
  const t = useStrings(STRINGS);
  const game = useCodenamesGame(gameId, apiKey);
  const [godMode, setGodMode] = useState(true);
  useEffect(() => {
    setGodMode(loadGodMode());
  }, []);
  const toggleGod = () =>
    setGodMode((value) => {
      const next = !value;
      saveGodMode(next);
      return next;
    });

  if (!game.detail || !game.state) {
    return (
      <div className="relative z-10 flex min-h-dvh items-center justify-center px-4 text-muted">
        <div className="glass animate-pop flex max-w-sm flex-col items-center gap-4 rounded-3xl border px-8 py-7 text-center">
          <DealingLoader />
          <p className="text-[14px]">{game.error ?? t.loadingGame}</p>
          {game.error && (
            <button
              type="button"
              onClick={onExit}
              className="rounded-lg border border-line bg-panel px-3 py-1.5 text-[13px] font-medium text-ink transition-colors hover:bg-hover"
            >
              {t.backToSetup}
            </button>
          )}
        </div>
      </div>
    );
  }

  const runtimePaused =
    !game.detail.hasRuntime ||
    game.runtime?.paused === true ||
    game.state.status === "paused";

  return (
    <GameView
      mode="live"
      gameId={gameId}
      state={game.state}
      events={game.events}
      config={game.detail.game.config}
      paused={runtimePaused}
      speed={game.runtime?.speed ?? 1}
      godMode={godMode}
      connection={game.connection}
      thinking={game.thinking}
      recentGuess={game.recentGuess}
      metricsEvents={game.events}
      onToggleGod={toggleGod}
      onTogglePlay={() =>
        runtimePaused ? void game.resume() : void game.pause()
      }
      onStep={() => void game.step()}
      onStepTurn={() => void game.stepTurn()}
      human={(() => {
        const seat = Object.values(game.detail.game.config.seats).find((entry) => entry.human)?.seat;
        return seat ? { seat, apiKey } : undefined;
      })()}
      onAbort={() => void game.abort()}
      onSpeed={(speed) => void game.setSpeed(speed)}
      onExit={onExit}
      onReplay={onReplay}
      onNewGame={onNewGame}
      onRematch={async () => {
        const config = game.detail!.game.config;
        const swap = (from: "red_spymaster" | "red_operative" | "blue_spymaster" | "blue_operative", to: typeof from) => ({
          ...config.seats[from],
          seat: to,
        });
        try {
          const response = await createCodenamesGame(
            {
              seed: config.seed,
              lang: config.lang,
              seats: {
                red_spymaster: swap("blue_spymaster", "red_spymaster"),
                red_operative: swap("blue_operative", "red_operative"),
                blue_spymaster: swap("red_spymaster", "blue_spymaster"),
                blue_operative: swap("red_operative", "blue_operative"),
              },
              speed: game.runtime?.speed ?? config.speed,
              maxCostUsd: config.maxCostUsd,
              ...(config.providers ? { providers: config.providers } : {}),
            },
            apiKey,
          );
          saveActiveGame(response.gameId);
          onStarted(response.gameId);
        } catch (caught) {
          console.error(caught);
        }
      }}
      onOpenRules={onOpenRules}
      onOpenSettings={onOpenSettings}
      theme={theme}
      onThemeChange={onThemeChange}
      finished={game.state.status === "finished" || game.state.status === "aborted"}
      error={game.error}
    />
  );
}

/** The card just played, so the board pulses it as in a live game. */
function lastGuess(events: StoredGameEvent[]): string | null {
  const last = events[events.length - 1];
  return last?.type === "guess_made" ? last.data.word : null;
}

function DemoNotice({ config, onSetup }: { config: GameConfig; onSetup: () => void }) {
  const t = useStrings(STRINGS);
  const models = [...new Set(Object.values(config.seats).map((seat) => seat.modelId.split("/").pop()))];
  return (
    <div className="glass flex w-full flex-wrap items-center gap-2 rounded-2xl border border-accent/30 px-3 py-2">
      <Sparkles size={14} className="shrink-0 text-accent" />
      <span className="min-w-0 flex-1 text-[12.5px] text-ink-soft">
        {t.demoNotice(models.join(" · "))}
      </span>
      <button
        type="button"
        onClick={onSetup}
        className="btn-glow inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 text-[12.5px] font-semibold text-accent-ink"
      >
        {t.demoCta}
      </button>
    </div>
  );
}

function ReplayGame({
  gameId,
  onExit,
  onNewGame,
  onOpenRules,
  onOpenSettings,
  theme,
  onThemeChange,
}: Omit<GameScreenProps, "mode" | "hasServerKey" | "apiKey" | "onStarted">) {
  const t = useStrings(STRINGS);
  const replay = useCodenamesReplay(gameId);
  const [godMode, setGodMode] = useState(true);
  const isDemo = gameId.startsWith("demo-");
  // Demos start on their own, once, like a game someone is playing.
  const [autoStarted, setAutoStarted] = useState(false);
  const loaded = replay.data !== null;
  useEffect(() => {
    if (!isDemo || !loaded || autoStarted) return;
    setAutoStarted(true);
    replay.play();
  }, [autoStarted, isDemo, loaded, replay]);
  useEffect(() => {
    setGodMode(loadGodMode());
  }, []);
  const toggleGod = () =>
    setGodMode((value) => {
      const next = !value;
      saveGodMode(next);
      return next;
    });

  if (replay.loading || !replay.data || !replay.state) {
    return (
      <div className="relative z-10 flex min-h-dvh items-center justify-center px-4 text-muted">
        <div className="glass animate-pop flex max-w-sm flex-col items-center gap-4 rounded-3xl border px-8 py-7 text-center">
          <DealingLoader />
          <p className="text-[14px]">{replay.error ?? t.loadingReplay}</p>
          {replay.error && (
            <button
              type="button"
              onClick={onExit}
              className="rounded-lg border border-line bg-panel px-3 py-1.5 text-[13px] font-medium text-ink transition-colors hover:bg-hover"
            >
              {t.backToSetup}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <GameView
      mode="replay"
      gameId={gameId}
      state={replay.state}
      events={replay.visibleEvents}
      config={replay.data.game.config}
      paused={!replay.playing}
      speed={replay.speed}
      godMode={godMode}
      connection="closed"
      thinking={pendingThinker(replay.visibleEvents)}
      recentGuess={lastGuess(replay.visibleEvents)}
      metricsEvents={replay.visibleEvents}
      notice={
        isDemo ? (
          <DemoNotice config={replay.data.game.config} onSetup={onExit} />
        ) : undefined
      }
      onToggleGod={toggleGod}
      onTogglePlay={replay.toggle}
      onStep={replay.step}
      onRestart={replay.restart}
      onSpeed={replay.setSpeed}
      onExit={onExit}
      onNewGame={onNewGame}
      onSeek={replay.seek}
      cursor={replay.cursor}
      totalEvents={replay.events.length}
      onOpenRules={onOpenRules}
      onOpenSettings={onOpenSettings}
      theme={theme}
      onThemeChange={onThemeChange}
      finished={replay.finished}
      error={replay.error}
    />
  );
}

export function GameScreen({ mode, ...props }: GameScreenProps) {
  return mode === "replay" ? (
    <ReplayGame {...props} />
  ) : (
    <LiveGame {...props} />
  );
}
