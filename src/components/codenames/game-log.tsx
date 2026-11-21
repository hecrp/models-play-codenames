"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  MessageCircle,
  Pause,
  Play,
  ScrollText,
  Trophy,
  X,
} from "lucide-react";
import type { EventMeta, GameConfig, Seat, StoredGameEvent, Team } from "@/lib/codenames/types";
import { avatarById } from "@/lib/codenames/avatars";
import { teamOfSeat } from "@/lib/codenames/seats";
import { useStrings, type Locale } from "@/lib/i18n";
import { cn, formatCost, formatTokens } from "@/lib/utils";
import { Avatar } from "./avatar";

const ES = {
  team: { red: "rojo", blue: "azul" } as Record<Team, string>,
  reasoningAndMetrics: "Razonamiento y métricas",
  metrics: "Métricas",
  targets: "Objetivos",
  results: {
    own: "✓ propia",
    opponent: "✗ rival",
    neutral: "· neutral",
    assassin: "☠ asesino",
  } as Record<string, string>,
  gameStarted: (team: string) => `Comienza la partida · empieza ${team}`,
  turnHeader: (turn: number, team: string) => `Turno ${turn} · ${team}`,
  gameOverReasons: {
    all_cards: "todas las cartas",
    assassin: "asesino",
    turn_limit: "límite de turnos",
    aborted: "abortada",
    cost_limit: "tope de coste",
    error: "error del modelo",
  } as Record<string, string>,
  draw: "Tablas",
  winner: (team: string, reason: string) => `Gana ${team} · ${reason}`,
  gameEnded: (reason: string) => `Partida terminada · ${reason}`,
  gamePaused: "Partida en pausa",
  gameResumed: "Partida reanudada",
  stops: "se planta",
  turnEndReasons: {
    stopped: "el agente se planta",
    clue_failed: "pista fallida: el turno pasa al rival",
    attempts_exhausted: "intentos agotados: el turno pasa al rival",
    turn_limit: "límite de 40 turnos",
  } as Record<string, string>,
  roleSpymaster: "jefe",
  roleOperative: "agente",
  attemptsLeft: (count: number) => `${count} intentos restantes`,
  clue: "Pista",
  guess: "Adivina",
  noClue: "sin pista",
  stopShort: "planta",
  thinking: "Pensando…",
  log: "Registro",
  logAria: "Registro de la partida",
  expandAll: "Expandir todos los turnos",
  collapseAll: "Colapsar todos los turnos",
  hideLog: "Ocultar registro",
  noMoves: "Aún no hay jugadas.",
  seeLatest: "Ver lo último",
};

const STRINGS: Record<Locale, typeof ES> = {
  es: ES,
  en: {
    team: { red: "red", blue: "blue" },
    reasoningAndMetrics: "Reasoning and metrics",
    metrics: "Metrics",
    targets: "Targets",
    results: {
      own: "✓ own",
      opponent: "✗ opponent",
      neutral: "· neutral",
      assassin: "☠ assassin",
    },
    gameStarted: (team) => `Game starts · ${team} goes first`,
    turnHeader: (turn, team) => `Turn ${turn} · ${team}`,
    gameOverReasons: {
      all_cards: "all cards",
      assassin: "assassin",
      turn_limit: "turn limit",
      aborted: "aborted",
      cost_limit: "cost cap",
      error: "model error",
    },
    draw: "Draw",
    winner: (team, reason) => `${team} wins · ${reason}`,
    gameEnded: (reason) => `Game over · ${reason}`,
    gamePaused: "Game paused",
    gameResumed: "Game resumed",
    stops: "stops",
    turnEndReasons: {
      stopped: "the operative stops",
      clue_failed: "failed clue: turn passes to the opponent",
      attempts_exhausted: "attempts exhausted: turn passes to the opponent",
      turn_limit: "40-turn limit",
    },
    roleSpymaster: "spymaster",
    roleOperative: "operative",
    attemptsLeft: (count) => `${count} attempts left`,
    clue: "Clue",
    guess: "Guesses",
    noClue: "no clue",
    stopShort: "stops",
    thinking: "Thinking…",
    log: "Log",
    logAria: "Game log",
    expandAll: "Expand all turns",
    collapseAll: "Collapse all turns",
    hideLog: "Hide log",
    noMoves: "No moves yet.",
    seeLatest: "See latest",
  },
};

const LONG_SAY = 90;

export function SpeechBubble({
  text,
  team,
  className,
}: {
  text: string;
  team: Team;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const color = team === "red" ? "var(--team-red)" : "var(--team-blue)";
  const long = text.length > LONG_SAY;

  return (
    <button
      type="button"
      onClick={() => long && setOpen((value) => !value)}
      aria-expanded={long ? open : undefined}
      className={cn(
        "group flex w-full items-start gap-1.5 rounded-lg border-l-2 px-2 py-1 text-left text-[12.5px] italic leading-snug text-ink-soft",
        long ? "cursor-pointer" : "cursor-default",
        className,
      )}
      style={{
        borderColor: color,
        background: `color-mix(in oklab, ${color} 8%, transparent)`,
      }}
    >
      <MessageCircle size={12} className="mt-0.5 shrink-0 not-italic text-faint" />
      <span className={cn("min-w-0 flex-1 whitespace-pre-wrap break-words", !open && "line-clamp-2")}>
        “{text}”
      </span>
      {long && (
        <ChevronDown
          size={12}
          className={cn("mt-0.5 shrink-0 text-faint transition-transform", open && "rotate-180")}
        />
      )}
    </button>
  );
}

function DetailsToggle({
  meta,
  reasoning,
  targets,
}: {
  meta?: EventMeta;
  reasoning?: string;
  targets?: string[];
}) {
  const t = useStrings(STRINGS);
  const [open, setOpen] = useState(false);
  const text = reasoning ?? meta?.reasoning;
  const tokens = meta
    ? `${formatTokens(meta.promptTokens ?? 0)} → ${formatTokens(meta.completionTokens ?? 0)} tokens`
    : null;
  const cost = formatCost(meta?.costUsd);
  if (!text && !tokens && !cost) return null;

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[11px] text-faint transition-colors hover:bg-hover hover:text-muted"
      >
        <ChevronDown size={11} className={cn("transition-transform", open && "rotate-180")} />
        {text ? t.reasoningAndMetrics : t.metrics}
      </button>
      {open && (
        <div className="mt-1 space-y-1.5 rounded-lg border border-line bg-panel/60 px-2.5 py-2">
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-faint">
            {meta?.modelId && <span className="font-mono">{meta.modelId}</span>}
            {tokens && <span>{tokens}</span>}
            {cost && <span>{cost}</span>}
            {meta?.latencyMs !== undefined && <span>{meta.latencyMs} ms</span>}
            {meta?.promptVersion && <span>prompt {meta.promptVersion}</span>}
            {meta?.provider && <span>{meta.provider}</span>}
          </div>
          {targets && targets.length > 0 && (
            <p className="text-[11.5px] text-muted">
              <span className="font-semibold text-faint">{t.targets}:</span>{" "}
              <span className="uppercase tracking-wide">{targets.join(" · ")}</span>
            </p>
          )}
          {text && (
            <p className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-muted">
              {text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ActorRow({
  seat,
  config,
  action,
  say,
  reasoning,
  targets,
  meta,
}: {
  seat: Seat;
  config: GameConfig;
  action: React.ReactNode;
  say?: string;
  reasoning?: string;
  targets?: string[];
  meta?: EventMeta;
}) {
  const seatConfig = config.seats[seat];
  const avatar = avatarById(seatConfig.avatarId);
  const team = teamOfSeat(seat);
  if (!avatar) return null;

  return (
    <article className="animate-log-in flex gap-2 py-1.5">
      <Avatar avatar={avatar} team={team} size={26} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cn("text-[12px] font-semibold", TEAM_TEXT[team])}>
            {seatConfig.displayName}
          </span>
          {action}
        </div>
        {say && <SpeechBubble text={say} team={team} className="mt-1" />}
        <DetailsToggle meta={meta} reasoning={reasoning} targets={targets} />
      </div>
    </article>
  );
}

const TEAM_TEXT = {
  red: "text-team-red-ink",
  blue: "text-team-blue-ink",
};

const TEAM_BG = {
  red: "bg-team-red",
  blue: "bg-team-blue",
};

const RESULT_STYLES: Record<string, { className: string }> = {
  own: {
    className: "border-accent/30 bg-accent-soft text-accent",
  },
  opponent: {
    className: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300",
  },
  neutral: {
    className: "border-line-strong bg-panel text-muted",
  },
  assassin: {
    className: "border-danger/40 bg-danger/10 text-danger",
  },
};

function SystemRow({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "error" | "success";
}) {
  return (
    <div className="animate-fade-in flex items-center gap-2 py-1.5">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-line-strong" />
      <span
        className={cn(
          "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
          tone === "error"
            ? "border-danger/30 bg-danger/5 text-danger"
            : tone === "success"
              ? "border-accent/30 bg-accent-soft text-accent"
              : "border-line bg-panel text-faint",
        )}
      >
        {children}
      </span>
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-line-strong" />
    </div>
  );
}

function EventRow({
  event,
  config,
}: {
  event: StoredGameEvent;
  config: GameConfig;
}) {
  const t = useStrings(STRINGS);
  if (
    event.type === "game_started" ||
    event.type === "turn_started" ||
    event.type === "thinking" ||
    event.type === "control_changed"
  ) {
    if (event.type === "game_started") {
      return (
        <SystemRow>
          {t.gameStarted(t.team[event.data.startingTeam])}
        </SystemRow>
      );
    }
    if (event.type === "turn_started") {
      return (
        <SystemRow>
          {t.turnHeader(event.data.turn, t.team[event.data.team])}
        </SystemRow>
      );
    }
    return null;
  }

  if (event.type === "game_over") {
    const reasonLabels = t.gameOverReasons;
    return (
      <SystemRow tone={event.data.winner === "draw" ? "neutral" : "success"}>
        <Trophy size={10} className="mr-1 inline" />
        {event.data.winner === "draw"
          ? t.draw
          : event.data.winner
            ? t.winner(t.team[event.data.winner], reasonLabels[event.data.reason] ?? event.data.reason)
            : t.gameEnded(reasonLabels[event.data.reason] ?? event.data.reason)}
      </SystemRow>
    );
  }

  if (event.type === "game_paused") {
    return (
      <SystemRow tone={event.data.reason === "error" ? "error" : "neutral"}>
        <Pause size={10} className="mr-1 inline" />
        {event.data.message ? event.data.message : t.gamePaused}
      </SystemRow>
    );
  }

  if (event.type === "game_resumed") {
    return (
      <SystemRow>
        <Play size={10} className="mr-1 inline" />
        {t.gameResumed}
      </SystemRow>
    );
  }

  if (event.type === "turn_ended") {
    if (
      event.data.reason === "opponent_card" ||
      event.data.reason === "neutral_card" ||
      event.data.reason === "assassin" ||
      event.data.reason === "guesses_exhausted"
    ) {
      return null;
    }
    if (event.data.reason === "stopped" && event.seat) {
      return (
        <ActorRow
          seat={event.seat}
          config={config}
          action={
            <span className="rounded-full border border-line px-2 py-px text-[11px] font-semibold text-muted">
              {t.stops}
            </span>
          }
          say={event.data.say}
          reasoning={event.data.reasoning}
          meta={event.meta}
        />
      );
    }
    const reasonLabels = t.turnEndReasons;
    return (
      <SystemRow
        tone={
          event.data.reason === "clue_failed" ||
          event.data.reason === "attempts_exhausted"
            ? "error"
            : "neutral"
        }
      >
        {reasonLabels[event.data.reason] ?? event.data.reason}
      </SystemRow>
    );
  }

  if (event.type === "agent_error") {
    const errorTeam = teamOfSeat(event.seat);
    const errorRole = event.seat.endsWith("spymaster") ? t.roleSpymaster : t.roleOperative;
    return (
      <article className="animate-log-in my-1 flex gap-2.5 rounded-xl border border-danger/20 bg-danger/5 px-3 py-2">
        <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border border-danger/30 bg-danger/5 text-danger">
          <AlertTriangle size={13} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
            <span className="font-semibold text-danger">
              {t.team[errorTeam]} · {errorRole}
            </span>
            <span className="rounded-full border border-danger/20 px-1.5 py-px">
              {event.data.code}
            </span>
            <span>{t.attemptsLeft(event.data.attemptsLeft)}</span>
          </div>
          <p className="mt-0.5 text-[14px] leading-relaxed text-danger">
            {event.data.message}
          </p>
        </div>
      </article>
    );
  }

  const seat = event.seat as Seat;
  const team = teamOfSeat(seat);

  let text: React.ReactNode = null;
  let say: string | undefined;
  if (event.type === "clue_given") {
    say = event.data.say;
    text = (
      <span className="inline-flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">
          {t.clue}
        </span>
        <span className="font-display text-[16px] font-semibold uppercase tracking-wider text-ink">
          {event.data.word}
        </span>
        <span
          className={cn(
            "grid size-6 place-items-center rounded-md text-[12px] font-bold text-white",
            TEAM_BG[team],
          )}
        >
          {event.data.number}
        </span>
      </span>
    );
  } else if (event.type === "guess_made") {
    say = event.data.say;
    const result = RESULT_STYLES[event.data.result] ?? RESULT_STYLES.neutral;
    text = (
      <span className="inline-flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">
          {t.guess}
        </span>
        <span className="font-display text-[15px] font-medium uppercase tracking-wider text-ink">
          {event.data.word}
        </span>
        <span
          className={cn(
            "rounded-full border px-2 py-px text-[11px] font-semibold",
            result.className,
          )}
        >
          {t.results[event.data.result] ?? t.results.neutral}
        </span>
      </span>
    );
  }

  if (!text) return null;

  return (
    <ActorRow
      seat={seat}
      config={config}
      action={text}
      say={say}
      reasoning={event.type === "clue_given" ? event.data.reasoning : undefined}
      targets={event.type === "clue_given" ? event.data.targets : undefined}
      meta={event.meta}
    />
  );
}

interface TurnGroup {
  key: string;
  turn: number | null;
  team: Team | null;
  events: StoredGameEvent[];
}

function groupByTurn(events: StoredGameEvent[]): TurnGroup[] {
  const groups: TurnGroup[] = [];
  let current: TurnGroup = { key: "start", turn: null, team: null, events: [] };
  for (const event of events) {
    if (event.type === "turn_started") {
      if (current.events.length > 0 || current.turn !== null) groups.push(current);
      current = {
        key: `turn-${event.id}`,
        turn: event.data.turn,
        team: event.data.team,
        events: [],
      };
      continue;
    }
    current.events.push(event);
  }
  if (current.events.length > 0 || current.turn !== null) groups.push(current);
  return groups;
}

const RESULT_DOT: Record<string, string> = {
  own: "bg-accent",
  opponent: "bg-amber-500",
  neutral: "bg-line-strong",
  assassin: "bg-danger",
};

function TurnSummary({ group }: { group: TurnGroup }) {
  const t = useStrings(STRINGS);
  const clue = group.events.find((event) => event.type === "clue_given");
  const guesses = group.events.filter((event) => event.type === "guess_made");
  const errors = group.events.filter((event) => event.type === "agent_error").length;
  const stopped = group.events.some(
    (event) => event.type === "turn_ended" && event.data.reason === "stopped",
  );

  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      {clue?.type === "clue_given" ? (
        <span className="truncate font-display text-[13px] font-semibold uppercase tracking-wider text-ink">
          {clue.data.word} · {clue.data.number}
        </span>
      ) : (
        <span className="text-[12px] text-faint">{t.noClue}</span>
      )}
      <span className="flex shrink-0 items-center gap-1">
        {guesses.map((event) =>
          event.type === "guess_made" ? (
            <span
              key={event.id}
              title={`${event.data.word} · ${t.results[event.data.result] ?? event.data.result}`}
              className={cn("size-2 rounded-full", RESULT_DOT[event.data.result] ?? RESULT_DOT.neutral)}
            />
          ) : null,
        )}
      </span>
      {stopped && <span className="shrink-0 text-[11px] text-faint">{t.stopShort}</span>}
      {errors > 0 && (
        <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-danger">
          <AlertTriangle size={10} />
          {errors}
        </span>
      )}
    </span>
  );
}

function TurnSection({
  group,
  config,
  open,
  onToggle,
}: {
  group: TurnGroup;
  config: GameConfig;
  open: boolean;
  onToggle: () => void;
}) {
  const t = useStrings(STRINGS);
  if (group.turn === null || !group.team) {
    return (
      <div>
        {group.events.map((event) => (
          <EventRow key={event.id} event={event} config={config} />
        ))}
      </div>
    );
  }

  return (
    <div className="border-b border-line/50 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-hover/50"
      >
        <ChevronDown
          size={13}
          className={cn("shrink-0 text-faint transition-transform", !open && "-rotate-90")}
        />
        <span className={cn("size-2 shrink-0 rounded-full", TEAM_BG[group.team])} />
        <span className={cn("shrink-0 text-[11.5px] font-semibold", TEAM_TEXT[group.team])}>
          T{group.turn}
        </span>
        <TurnSummary group={group} />
      </button>
      {open && (
        <div className="pb-1.5 pl-5">
          {group.events.length === 0 ? (
            <p className="py-1 text-[12px] text-faint">{t.thinking}</p>
          ) : (
            group.events.map((event) => (
              <EventRow key={event.id} event={event} config={config} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function GameLog({
  events,
  config,
  onClose,
  className,
}: {
  events: StoredGameEvent[];
  config: GameConfig;
  onClose: () => void;
  className?: string;
}) {
  const t = useStrings(STRINGS);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const groups = useMemo(() => groupByTurn(events), [events]);
  const lastKey = groups[groups.length - 1]?.key;
  const isOpen = (key: string) => overrides[key] ?? key === lastKey;
  const setAll = (open: boolean) =>
    setOverrides(Object.fromEntries(groups.map((group) => [group.key, open])));

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    const element = scrollRef.current;
    if (element) element.scrollTo({ top: element.scrollHeight, behavior });
  };

  useEffect(() => {
    if (stickRef.current) scrollToBottom("auto");
  }, [events.length]);

  return (
    <section
      className={cn(
        "glass relative flex min-h-0 flex-col overflow-hidden rounded-2xl border",
        className,
      )}
      aria-label={t.logAria}
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-line/70 px-3 py-1.5">
        <h3 className="inline-flex items-center gap-1.5 font-display text-[13px] font-semibold uppercase tracking-[0.18em] text-muted">
          <ScrollText size={13} className="text-accent" />
          {t.log}
        </h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setAll(true)}
            title={t.expandAll}
            aria-label={t.expandAll}
            className="rounded-md p-1 text-faint transition-colors hover:bg-hover hover:text-ink"
          >
            <ChevronsUpDown size={13} />
          </button>
          <button
            type="button"
            onClick={() => setAll(false)}
            title={t.collapseAll}
            aria-label={t.collapseAll}
            className="rounded-md p-1 text-faint transition-colors hover:bg-hover hover:text-ink"
          >
            <ChevronsDownUp size={13} />
          </button>
          <button
            type="button"
            onClick={onClose}
            title={t.hideLog}
            aria-label={t.hideLog}
            className="rounded-md p-1 text-faint transition-colors hover:bg-hover hover:text-ink"
          >
            <X size={14} />
          </button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={() => {
            const element = scrollRef.current;
            if (!element) return;
            const near =
              element.scrollHeight - element.scrollTop - element.clientHeight < 60;
            stickRef.current = near;
            setAtBottom(near);
          }}
          className={cn(
            "h-full min-h-0 overflow-y-auto px-3 py-1",
            "[mask-image:linear-gradient(to_bottom,transparent_0,#000_10px,#000_calc(100%-14px),transparent_100%)]",
          )}
        >
          {events.length === 0 ? (
            <p className="py-6 text-center text-[12.5px] text-faint">
              {t.noMoves}
            </p>
          ) : (
            groups.map((group) => (
              <TurnSection
                key={group.key}
                group={group}
                config={config}
                open={isOpen(group.key)}
                onToggle={() =>
                  setOverrides((value) => ({ ...value, [group.key]: !isOpen(group.key) }))
                }
              />
            ))
          )}
        </div>

        {!atBottom && (
          <button
            type="button"
            onClick={() => {
              stickRef.current = true;
              setAtBottom(true);
              scrollToBottom();
            }}
            className="absolute bottom-2 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-accent/40 bg-elevated/95 px-3 py-1 text-[11.5px] font-semibold text-accent shadow-lg backdrop-blur transition-transform hover:-translate-y-0.5"
          >
            <ArrowDown size={12} />
            {t.seeLatest}
          </button>
        )}
      </div>
    </section>
  );
}

