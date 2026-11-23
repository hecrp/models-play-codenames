"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Brain, Crosshair, Crown, Eye, EyeOff, Hand, RotateCcw, WifiOff, X } from "lucide-react";
import type {
  GameState,
  GuessResult,
  Seat,
  SeatConfig,
  StoredGameEvent,
  Team,
} from "@/lib/codenames/types";
import { avatarById } from "@/lib/codenames/avatars";
import { operativeSeat, spymasterSeat, teamOfSeat } from "@/lib/codenames/seats";
import {
  buildTeamThread,
  type Forfeit,
  type TargetOutcome,
  type ThreadItem,
} from "@/lib/codenames/team-thread";
import { useStrings, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui";
import { Avatar } from "./avatar";
import { TARGET_MARKS } from "./board";

const ES = {
  team: { red: "rojo", blue: "azul" } as Record<Team, string>,
  teamAria: (team: string) => `Equipo ${team}`,
  chatAria: (team: string) => `Conversación del equipo ${team}`,
  showReasoning: "Razonamiento",
  targets: "Objetivos",
  showOnBoard: "Ver en el tablero",
  hideOnBoard: "Quitar del tablero",
  outcomes: {
    hit: () => "Encontrada en ese mismo turno",
    later: (turn?: number) => `Encontrada más tarde${turn ? ` (turno ${turn})` : ""}`,
    rival: (turn?: number) => `La descubrió el rival${turn ? ` (turno ${turn})` : ""}`,
    pending: () => "Todavía sin descubrir",
  } as Record<TargetOutcome, (turn?: number) => string>,
  showReasoningAria: (name: string) => `Ver el razonamiento de ${name}`,
  reasoningOf: (name: string) => `Razonamiento de ${name}`,
  roleTurn: (role: string, turn: number) => `${role} · turno ${turn}`,
  moveNote: "Nota que dejó en la jugada",
  modelReasoning: "Razonamiento del modelo",
  truncated: "El razonamiento se guarda recortado a 4.000 caracteres.",
  reasoningTokens: (n: number) => `${n.toLocaleString("es")} tokens de razonamiento`,
  seconds: (ms: number) => `${(ms / 1000).toLocaleString("es", { maximumFractionDigits: 1 })} s`,
  effort: (level: string) => `esfuerzo ${level}`,
  close: "Cerrar",
  guessLabels: {
    own: "✓ acierto",
    opponent: "✗ del rival",
    neutral: "· neutral",
    assassin: "☠ asesino",
  } as Record<GuessResult, string>,
  forfeits: {
    clue_failed: "Pista fallida: pierde el turno",
    attempts_exhausted: "Sin jugada válida: pierde el turno",
  } as Record<Forfeit, string>,
  rejected: "Jugada rechazada",
  connection: "Problema de conexión, reintentando",
  turnN: (turn: number) => `Turno ${turn}`,
  clue: "Pista",
  asideHint:
    "Ningún modelo ve este comentario, tampoco su agente: en Codenames el jefe solo dice la pista. Es un aparte para quien mira la partida.",
  unlimited: "sin límite",
  stops: "Me planto",
  spymaster: "Jefe",
  operative: "Agente",
  you: "tú",
  waitingYou: "Esperando tu jugada…",
  thinkingClue: "Pensando una pista…",
  choosingCard: "Eligiendo carta…",
  empty: "Aún no han hablado.",
  givingClue: "Dando pista",
  guessing: "Adivinando",
  waiting: "Esperando",
  attempts: "Intentos",
};

const STRINGS: Record<Locale, typeof ES> = {
  es: ES,
  en: {
    team: { red: "red", blue: "blue" },
    teamAria: (team) => `Team ${team}`,
    chatAria: (team) => `Team ${team} conversation`,
    showReasoning: "Reasoning",
    targets: "Targets",
    showOnBoard: "Show on board",
    hideOnBoard: "Hide from board",
    outcomes: {
      hit: () => "Found on that same turn",
      later: (turn) => `Found later${turn ? ` (turn ${turn})` : ""}`,
      rival: (turn) => `Revealed by the rival${turn ? ` (turn ${turn})` : ""}`,
      pending: () => "Not found yet",
    },
    showReasoningAria: (name) => `Show ${name}'s reasoning`,
    reasoningOf: (name) => `${name}'s reasoning`,
    roleTurn: (role, turn) => `${role} · turn ${turn}`,
    moveNote: "Note left with the move",
    modelReasoning: "Model reasoning",
    truncated: "Reasoning is stored cut to 4,000 characters.",
    reasoningTokens: (n) => `${n.toLocaleString("en")} reasoning tokens`,
    seconds: (ms) => `${(ms / 1000).toLocaleString("en", { maximumFractionDigits: 1 })} s`,
    effort: (level) => `${level} effort`,
    close: "Close",
    guessLabels: {
      own: "✓ correct",
      opponent: "✗ opponent's",
      neutral: "· neutral",
      assassin: "☠ assassin",
    },
    forfeits: {
      clue_failed: "Failed clue: loses the turn",
      attempts_exhausted: "No valid move: loses the turn",
    },
    rejected: "Move rejected",
    connection: "Connection problem, retrying",
    turnN: (turn) => `Turn ${turn}`,
    clue: "Clue",
    asideHint:
      "No model sees this line, not even their operative: in Codenames the spymaster only says the clue. It is an aside for whoever watches the game.",
    unlimited: "unlimited",
    stops: "I'll stop here",
    spymaster: "Spymaster",
    operative: "Operative",
    you: "you",
    waitingYou: "Waiting for your move…",
    thinkingClue: "Thinking of a clue…",
    choosingCard: "Choosing a card…",
    empty: "No messages yet.",
    givingClue: "Giving clue",
    guessing: "Guessing",
    waiting: "Waiting",
    attempts: "Attempts",
  },
};

const TEAM_STYLES = {
  red: {
    border: "border-team-red/30",
    activeBorder: "border-team-red/70",
    text: "text-team-red-ink",
    bar: "bg-team-red",
    glow: "shadow-[0_0_44px_-14px_var(--team-red)]",
    color: "var(--team-red)",
    gradient:
      "bg-[linear-gradient(160deg,color-mix(in_oklab,var(--team-red)_16%,transparent),transparent_55%)]",
  },
  blue: {
    border: "border-team-blue/30",
    activeBorder: "border-team-blue/70",
    text: "text-team-blue-ink",
    bar: "bg-team-blue",
    glow: "shadow-[0_0_44px_-14px_var(--team-blue)]",
    color: "var(--team-blue)",
    gradient:
      "bg-[linear-gradient(160deg,color-mix(in_oklab,var(--team-blue)_16%,transparent),transparent_55%)]",
  },
} as const;

const GUESS_STYLES: Record<GuessResult, string> = {
  own: "border-accent/35 bg-accent-soft text-accent",
  opponent: "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  neutral: "border-line-strong bg-panel text-muted",
  assassin: "border-danger/45 bg-danger/10 text-danger",
};

function sender(item: ThreadItem): Seat | null {
  return item.kind === "clue" || item.kind === "guess" || item.kind === "stop"
    ? item.seat
    : null;
}

/**
 * Crossed-out eye before a spymaster's line: hovering or focusing it explains
 * that no model reads it. The hint is portaled and fixed so the chat's
 * scrolling and the bubble's animation cannot clip or shift it.
 */
function HiddenFromModels({ hint }: { hint: string }) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number; above: boolean } | null>(null);

  const show = () => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 240;
    const left = Math.min(Math.max(8, rect.left - 8), window.innerWidth - width - 8);
    // Below the icon unless that runs off the bottom of the window.
    const above = rect.bottom + 96 > window.innerHeight;
    setPosition({ left, top: above ? rect.top - 6 : rect.bottom + 6, above });
  };
  const hide = () => setPosition(null);

  return (
    <>
      <span
        ref={anchorRef}
        tabIndex={0}
        role="img"
        aria-label={hint}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        className="mt-[3px] inline-flex shrink-0 cursor-help rounded text-faint outline-none transition-colors hover:text-muted focus-visible:text-ink"
      >
        <EyeOff size={11} aria-hidden="true" />
      </span>
      {position &&
        createPortal(
          <span
            role="tooltip"
            className="animate-fade-in pointer-events-none fixed z-[70] w-60 rounded-lg border border-line bg-elevated px-2.5 py-1.5 text-[11.5px] not-italic leading-snug text-ink-soft shadow-lg"
            style={{
              left: position.left,
              top: position.top,
              transform: position.above ? "translateY(-100%)" : undefined,
            }}
          >
            {hint}
          </span>,
          document.body,
        )}
    </>
  );
}

function Bubble({
  side,
  team,
  showTail,
  children,
}: {
  side: "left" | "right";
  team: Team;
  showTail: boolean;
  children: React.ReactNode;
}) {
  const color = TEAM_STYLES[team].color;
  return (
    <div
      className={cn(
        "animate-pop w-fit max-w-full rounded-2xl px-2.5 py-1.5 text-[12.5px] leading-snug text-ink",
        side === "left"
          ? cn("border border-transparent", showTail && "rounded-bl-md")
          : cn("border border-line bg-elevated", showTail && "rounded-br-md"),
      )}
      style={
        side === "left"
          ? {
              background: `color-mix(in oklab, ${color} 17%, var(--elevated))`,
              borderColor: `color-mix(in oklab, ${color} 30%, transparent)`,
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}

type MessageItem = Extract<ThreadItem, { kind: "clue" | "guess" | "stop" }>;
export type ClueItem = Extract<ThreadItem, { kind: "clue" }>;

/** What the move was, as one line, so the reasoning reads in context. */
function MoveSummary({ item, team }: { item: MessageItem; team: Team }) {
  const t = useStrings(STRINGS);
  if (item.kind === "clue") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-faint">{t.clue}</span>
        <span className="font-display text-[15px] font-semibold uppercase tracking-wider text-ink">{item.word}</span>
        <span className={cn("grid size-5 place-items-center rounded-md text-[11px] font-bold text-white", TEAM_STYLES[team].bar)}>
          {item.number}
        </span>
      </span>
    );
  }
  if (item.kind === "guess") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="font-display text-[15px] font-semibold uppercase tracking-wider text-ink">{item.word}</span>
        <span className={cn("rounded-full border px-1.5 py-px text-[10.5px] font-semibold", GUESS_STYLES[item.result])}>
          {t.guessLabels[item.result]}
        </span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-muted">
      <Hand size={12} />
      {t.stops}
    </span>
  );
}

/** Scrollable pop-up with the reasoning behind one chat message. */
function ReasoningModal({
  item,
  team,
  config,
  onClose,
}: {
  item: MessageItem | null;
  team: Team;
  config: SeatConfig | undefined;
  onClose: () => void;
}) {
  const t = useStrings(STRINGS);
  const thought = item?.thought;
  const avatar = config ? avatarById(config.avatarId) : undefined;
  const isSpymaster = item ? item.seat === spymasterSeat(team) : false;
  const details = thought
    ? [
        thought.modelId,
        thought.effort ? t.effort(thought.effort) : null,
        thought.reasoningTokens ? t.reasoningTokens(thought.reasoningTokens) : null,
        thought.latencyMs ? t.seconds(thought.latencyMs) : null,
      ].filter(Boolean)
    : [];

  return (
    <Modal
      open={item !== null && thought !== undefined}
      onClose={onClose}
      label={config ? t.reasoningOf(config.displayName) : t.modelReasoning}
    >
      {item && thought && config && (
        <>
          <header className="flex items-start gap-2.5 border-b border-line/70 px-4 py-3">
            {avatar && <Avatar avatar={avatar} team={team} size={34} />}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold text-ink">{t.reasoningOf(config.displayName)}</p>
              <p className={cn("text-[11.5px] font-medium", TEAM_STYLES[team].text)}>
                {t.roleTurn(isSpymaster ? t.spymaster : t.operative, item.turn)}
              </p>
              <div className="mt-1.5">
                <MoveSummary item={item} team={team} />
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t.close}
              className="rounded-md p-1 text-faint transition-colors hover:bg-hover hover:text-ink"
            >
              <X size={16} />
            </button>
          </header>
          {details.length > 0 && (
            <p className="border-b border-line/50 px-4 py-1.5 font-mono text-[10.5px] text-faint">
              {details.join(" · ")}
            </p>
          )}
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3">
            {thought.note && (
              <section>
                <h4 className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-faint">
                  {t.moveNote}
                </h4>
                <p className="whitespace-pre-wrap break-words rounded-lg border border-line/60 bg-canvas/50 px-2.5 py-2 text-[13px] leading-relaxed text-ink-soft">
                  {thought.note}
                </p>
              </section>
            )}
            {thought.text && (
              <section>
                <h4 className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-faint">
                  {t.modelReasoning}
                </h4>
                <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ink-soft">
                  {thought.text}
                </p>
                {thought.text.length >= 4000 && (
                  <p className="mt-2 text-[11px] italic text-faint">{t.truncated}</p>
                )}
              </section>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}

/** Longest a message takes to type out, so it ends before the next move. */
const STREAM_MAX_MS = 1200;
/** More fresh messages than this at once means a load or a replay jump. */
const STREAM_BULK_LIMIT = 3;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

/**
 * Types a message out in word-sized chunks, the way an LLM's answer streams
 * in. Whether to animate is decided once, on mount, so later re-renders never
 * restart or cut the effect.
 */
function StreamingText({
  text,
  animate,
  onDone,
}: {
  text: string;
  animate: boolean;
  onDone: () => void;
}) {
  const chunks = useMemo(() => text.match(/\S+\s*/g) ?? [text], [text]);
  const [count, setCount] = useState(() =>
    animate && !prefersReducedMotion() ? 0 : chunks.length,
  );
  const done = count >= chunks.length;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (done) {
      doneRef.current();
      return;
    }
    // Short messages type at a natural pace; long ones speed up to fit.
    const step = Math.min(55, Math.max(18, STREAM_MAX_MS / chunks.length));
    const timer = window.setTimeout(() => setCount((value) => value + 1), step);
    return () => window.clearTimeout(timer);
  }, [count, done, chunks.length]);

  return (
    <p className="whitespace-pre-wrap break-words">
      {chunks.slice(0, count).join("")}
      {!done && <span className="stream-caret" aria-hidden="true" />}
    </p>
  );
}

function Message({
  item,
  team,
  config,
  firstOfGroup,
  lastOfGroup,
  onShowReasoning,
  animate,
  showIntent,
  focused,
  onFocus,
  hideAsides,
}: {
  /** A human operative is playing: the spymasters' asides are not for them. */
  hideAsides: boolean;
  /** Show what the spymaster aimed at (finished games and replays only). */
  showIntent: boolean;
  /** This clue's targets are marked on the board. */
  focused: boolean;
  onFocus: () => void;
  item: MessageItem;
  team: Team;
  config: SeatConfig;
  firstOfGroup: boolean;
  lastOfGroup: boolean;
  /** Set when the move kept its reasoning. */
  onShowReasoning?: () => void;
  /** The message just arrived live: type its text out. */
  animate: boolean;
}) {
  const t = useStrings(STRINGS);
  // The move itself (clue, card, stop) shows once the text has typed out.
  const styles = TEAM_STYLES[team];
  const isSpymaster = item.seat === spymasterSeat(team);
  // The spymaster only says the clue: their line is an aside the players never read.
  const say = isSpymaster && hideAsides ? undefined : item.say;
  const [streamed, setStreamed] = useState(() => !animate || !say);
  const side = isSpymaster ? "left" : "right";
  const avatar = avatarById(config.avatarId);

  return (
    <div
      className={cn(
        "flex items-end gap-1.5",
        side === "right" && "flex-row-reverse",
        firstOfGroup ? "mt-2" : "mt-0.5",
      )}
    >
      {/* A flex slot sizes to the avatar itself, with no inline line-height gap. */}
      <span className="flex w-6 shrink-0">
        {lastOfGroup && avatar && <Avatar avatar={avatar} team={team} size={24} />}
      </span>
      <div
        className={cn(
          "flex min-w-0 max-w-[86%] flex-col gap-0.5",
          side === "right" ? "items-end" : "items-start",
        )}
      >
        {firstOfGroup && (
          <span
            className={cn(
              "flex max-w-full items-center gap-1 px-1 text-[10.5px] font-semibold",
              styles.text,
            )}
          >
            {isSpymaster ? <Crown size={10} className="shrink-0" /> : <Eye size={10} className="shrink-0" />}
            <span className="truncate">
              {config.displayName}
              {config.human ? ` (${t.you})` : ""}
            </span>
          </span>
        )}
        <Bubble side={side} team={team} showTail={lastOfGroup}>
          {say && (
            <div className={cn(isSpymaster && "flex items-start gap-1.5 italic text-ink-soft")}>
              {isSpymaster && <HiddenFromModels hint={t.asideHint} />}
              <StreamingText text={say} animate={animate} onDone={() => setStreamed(true)} />
            </div>
          )}
          {streamed && item.kind === "clue" && (
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-xl border border-line/70 bg-canvas/70 py-1 pl-2 pr-1",
                say && "mt-1.5",
                animate && "animate-fade-in",
              )}
            >
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
                {t.clue}
              </span>
              <span
                className="min-w-0 truncate font-display text-[15px] font-semibold uppercase leading-none tracking-wider text-ink"
                title={item.word}
              >
                {item.word}
              </span>
              <span
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-md text-[11.5px] font-bold text-white",
                  styles.bar,
                )}
                title={item.number === 0 ? t.unlimited : undefined}
              >
                {item.number}
              </span>
            </span>
          )}
          {streamed && showIntent && item.kind === "clue" && item.targets && item.targets.length > 0 && (
            <span className={cn("mt-1.5 flex flex-wrap items-center gap-1", animate && "animate-fade-in")}>
              <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-faint">
                {t.targets}
              </span>
              {item.targets.map((target) => (
                <span
                  key={target.word}
                  title={t.outcomes[target.outcome](target.turn)}
                  className="inline-flex items-center gap-1 rounded-full border border-line/70 bg-canvas/60 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-ink-soft"
                >
                  <span
                    className="grid size-3.5 place-items-center rounded-full text-[8.5px] font-bold text-white"
                    style={{ background: TARGET_MARKS[target.outcome].color }}
                    aria-hidden="true"
                  >
                    {TARGET_MARKS[target.outcome].icon}
                  </span>
                  {target.word}
                </span>
              ))}
            </span>
          )}
          {streamed && item.kind === "guess" && (
            <span
              className={cn(
                "flex flex-wrap items-center gap-1.5",
                say && "mt-1.5",
                animate && "animate-fade-in",
              )}
            >
              <span className="font-display text-[14px] font-semibold uppercase leading-none tracking-wider text-ink">
                {item.word}
              </span>
              <span
                className={cn(
                  "rounded-full border px-1.5 py-px text-[10.5px] font-semibold",
                  GUESS_STYLES[item.result],
                )}
              >
                {t.guessLabels[item.result]}
              </span>
            </span>
          )}
          {streamed && item.kind === "stop" && (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[11.5px] font-semibold text-muted",
                say && "mt-1.5",
                animate && "animate-fade-in",
              )}
            >
              <Hand size={12} />
              {t.stops}
            </span>
          )}
        </Bubble>
        {streamed && (onShowReasoning || (showIntent && item.kind === "clue" && (item.targets?.length ?? 0) > 0)) && (
          <div className="flex flex-wrap items-center gap-0.5 whitespace-nowrap">
            {onShowReasoning && (
              <button
                type="button"
                onClick={onShowReasoning}
                aria-label={t.showReasoningAria(config.displayName)}
                className="inline-flex items-center gap-1 rounded-md px-1 py-px text-[10.5px] font-medium text-faint transition-colors hover:bg-hover hover:text-ink"
              >
                <Brain size={11} />
                {t.showReasoning}
              </button>
            )}
            {showIntent && item.kind === "clue" && (item.targets?.length ?? 0) > 0 && (
              <button
                type="button"
                onClick={onFocus}
                aria-pressed={focused}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-1 py-px text-[10.5px] font-medium transition-colors",
                  focused ? "bg-accent-soft text-accent" : "text-faint hover:bg-hover hover:text-ink",
                )}
              >
                <Crosshair size={11} />
                {focused ? t.hideOnBoard : t.showOnBoard}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TypingBubble({
  seat,
  team,
  config,
}: {
  seat: Seat;
  team: Team;
  config: SeatConfig;
}) {
  const t = useStrings(STRINGS);
  const isSpymaster = seat === spymasterSeat(team);
  const avatar = avatarById(config.avatarId);
  const side = isSpymaster ? "left" : "right";
  const caption = config.human
    ? t.waitingYou
    : isSpymaster
      ? t.thinkingClue
      : t.choosingCard;

  return (
    <div
      // Top-aligned so the avatar sits beside the bubble, not the caption below it.
      className={cn("mt-2 flex items-start gap-1.5", side === "right" && "flex-row-reverse")}
      aria-live="polite"
    >
      <span className="flex w-6 shrink-0">
        {avatar && (
          // The float moves avatar and halo together; the halo wraps exactly
          // the 24px avatar, so the ring is a circle centred on it.
          <span className="animate-float flex">
            <span
              className="aura flex rounded-full"
              style={{ "--aura": TEAM_STYLES[team].color } as React.CSSProperties}
            >
              <Avatar avatar={avatar} team={team} size={24} />
            </span>
          </span>
        )}
      </span>
      <div className={cn("flex flex-col gap-0.5", side === "right" ? "items-end" : "items-start")}>
        <Bubble side={side} team={team} showTail>
          <span className="flex h-3.5 items-center gap-1" aria-hidden="true">
            <span className="typing-dot" />
            <span className="typing-dot" style={{ animationDelay: "120ms" }} />
            <span className="typing-dot" style={{ animationDelay: "240ms" }} />
          </span>
        </Bubble>
        <span className="shimmer-text px-1 text-[10.5px] font-medium">{caption}</span>
      </div>
    </div>
  );
}

function SystemLine({
  tone,
  icon,
  text,
  title,
}: {
  tone: "danger" | "muted";
  icon: React.ReactNode;
  text: string;
  title?: string;
}) {
  return (
    <p
      title={title}
      className={cn(
        "animate-fade-in mx-auto mt-1.5 flex max-w-[92%] items-center justify-center gap-1 text-center text-[10.5px]",
        tone === "danger" ? "text-danger" : "text-faint",
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{text}</span>
    </p>
  );
}

function MemberChip({
  config,
  seat,
  team,
  acting,
}: {
  config: SeatConfig;
  seat: Seat;
  team: Team;
  acting: boolean;
}) {
  const t = useStrings(STRINGS);
  const avatar = avatarById(config.avatarId);
  const styles = TEAM_STYLES[team];
  const isSpymaster = seat === spymasterSeat(team);
  if (!avatar) return null;

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-1.5 rounded-xl border px-1.5 py-1 transition-all duration-300",
        acting ? cn(styles.activeBorder, "bg-elevated/80", styles.glow) : "border-line/60 bg-canvas/40",
      )}
      title={
        config.human
          ? t.you
          : `${config.modelId}${config.reasoningEffort ? ` · reasoning: ${config.reasoningEffort}` : ""}`
      }
    >
      <Avatar avatar={avatar} team={team} size={26} active={acting} />
      <div className="min-w-0 leading-tight">
        <span className={cn("flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-[0.12em]", styles.text)}>
          {isSpymaster ? <Crown size={9} className="shrink-0" /> : <Eye size={9} className="shrink-0" />}
          <span className="truncate">{isSpymaster ? t.spymaster : t.operative}</span>
        </span>
        <span className="block truncate text-[12px] font-semibold text-ink">{config.displayName}</span>
        <span className="block truncate font-mono text-[9.5px] text-faint">
          {config.human ? t.you : config.modelId.split("/").pop()}
        </span>
      </div>
    </div>
  );
}

/** Length of the light, as a share of the border (0-100). */
const TRACE_LENGTH = 26;
/** Seconds per lap: calm enough to read as "this team is playing". */
const TRACE_SECONDS = 6;
/**
 * Overlapping dashes that share the same front edge. Shorter dashes are more
 * opaque, so the light fades smoothly from its head to its tail.
 */
const TRACE_LAYERS = [
  { length: 26, opacity: 0.1 },
  { length: 18, opacity: 0.16 },
  { length: 11, opacity: 0.26 },
  { length: 5, opacity: 0.42 },
];

/**
 * A soft light that runs around the panel's rounded border at constant speed.
 * The rect is normalised to a length of 100, so the loop is seamless whatever
 * the panel's size or aspect ratio.
 */
function LiveTrace({ color }: { color: string }) {
  const size = { width: "calc(100% - 1.5px)", height: "calc(100% - 1.5px)" };
  return (
    <svg
      className="live-trace pointer-events-none absolute -left-px -top-px z-10 overflow-visible"
      style={{
        width: "calc(100% + 2px)",
        height: "calc(100% + 2px)",
        filter: `drop-shadow(0 0 3px color-mix(in oklab, ${color} 45%, transparent))`,
      }}
      aria-hidden="true"
    >
      {TRACE_LAYERS.map((layer) => (
        <rect
          key={layer.length}
          x={0.75}
          y={0.75}
          rx={16.25}
          pathLength={100}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeDasharray={`${layer.length} ${100 - layer.length}`}
          opacity={layer.opacity}
          style={{
            ...size,
            animationDuration: `${TRACE_SECONDS}s`,
            // Shift each dash so all of them end at the same front edge.
            animationDelay: `${(-(TRACE_LENGTH - layer.length) / 100) * TRACE_SECONDS}s`,
          }}
        />
      ))}
    </svg>
  );
}

export function TeamPanel({
  team,
  configs,
  state,
  thinking,
  events,
  className,
  showIntent = false,
  focusedClueId = null,
  onFocusClue,
  hideAsides = false,
}: {
  /** A human operative is playing: hide the spymasters' asides. */
  hideAsides?: boolean;
  team: Team;
  configs: Record<Seat, SeatConfig>;
  state: GameState;
  thinking: Seat | null;
  events: StoredGameEvent[];
  className?: string;
  /** Show each clue's targets and their fate (finished games and replays). */
  showIntent?: boolean;
  /** Id of the clue whose targets the board shows. */
  focusedClueId?: string | null;
  onFocusClue?: (clue: ClueItem | null) => void;
}) {
  const t = useStrings(STRINGS);
  const spymaster = spymasterSeat(team);
  const operative = operativeSeat(team);
  const total = team === state.startingTeam ? 9 : 8;
  // Hidden colors may be redacted for a human operative, so count reveals instead.
  const remaining =
    total - state.board.filter((card) => card.color === team && card.revealed).length;
  const styles = TEAM_STYLES[team];
  const isActive = state.turn.team === team && state.status !== "finished" && state.status !== "aborted";
  const actingSeat = isActive
    ? state.turn.phase === "clue"
      ? spymaster
      : operative
    : null;
  const typingSeat = thinking && teamOfSeat(thinking) === team ? thinking : null;

  const thread = useMemo(() => buildTeamThread(events, team), [events, team]);
  const [reading, setReading] = useState<MessageItem | null>(null);

  // Messages already on screen. Only ones arriving after that type out, and
  // only a few at a time: a page load or a replay jump shows everything at once.
  const seenRef = useRef<Set<string> | null>(null);
  const fresh = new Set<string>();
  if (seenRef.current) {
    for (const item of thread) if (!seenRef.current.has(item.id)) fresh.add(item.id);
    if (fresh.size > STREAM_BULK_LIMIT) fresh.clear();
  }
  useEffect(() => {
    seenRef.current = new Set(thread.map((item) => item.id));
  }, [thread]);

  // Keep following the bottom while a message types out and grows.
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const content = contentRef.current;
    const scroller = scrollRef.current;
    if (!content || !scroller) return;
    const observer = new ResizeObserver(() => {
      if (stickRef.current) scroller.scrollTop = scroller.scrollHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (element && stickRef.current) element.scrollTop = element.scrollHeight;
  }, [thread.length, typingSeat]);

  return (
    <aside
      className={cn(
        "glass relative flex min-w-0 flex-col gap-2 rounded-2xl border p-2.5 transition-all duration-500 lg:max-h-full",
        // The moving light marks the active team, so its static border stays soft.
        isActive ? cn(styles.border, styles.glow) : cn(styles.border, "opacity-90"),
        className,
      )}
      style={{ "--live": styles.color } as React.CSSProperties}
      aria-label={t.teamAria(t.team[team])}
    >
      <span
        className={cn("pointer-events-none absolute inset-0 rounded-2xl", styles.gradient)}
        aria-hidden="true"
      />
      {isActive && <LiveTrace color={styles.color} />}
      <header className="relative flex items-end justify-between gap-2 px-0.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={cn("live-dot", styles.text, !isActive && "opacity-40 [&::after]:hidden")} />
            <h2 className={cn("font-display text-[15px] font-semibold uppercase tracking-[0.18em]", styles.text)}>
              {t.team[team]}
            </h2>
          </div>
          <p className="mt-0.5 text-[11px] text-faint">
            {isActive ? (state.turn.phase === "clue" ? t.givingClue : t.guessing) : t.waiting}
          </p>
        </div>
        <div className="flex items-baseline gap-1 text-right">
          <span
            key={remaining}
            className={cn("animate-pop font-display text-[34px] font-bold leading-none tabular-nums", styles.text)}
            style={{ textShadow: `0 0 24px ${styles.color}` }}
          >
            {remaining}
          </span>
          <span className="text-[11px] text-faint">/{total}</span>
        </div>
      </header>

      <div className="relative flex gap-[3px]">
        {Array.from({ length: total }, (_, index) => (
          <span
            key={index}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-all duration-500",
              index < remaining ? styles.bar : "scale-y-50 bg-line-strong/50",
            )}
            style={index < remaining ? { boxShadow: `0 0 8px -1px ${styles.color}` } : undefined}
          />
        ))}
      </div>

      <div className="relative grid grid-cols-2 gap-1.5">
        <MemberChip config={configs[spymaster]} seat={spymaster} team={team} acting={actingSeat === spymaster} />
        <MemberChip config={configs[operative]} seat={operative} team={team} acting={actingSeat === operative} />
      </div>

      <div
        ref={scrollRef}
        onScroll={() => {
          const element = scrollRef.current;
          if (!element) return;
          stickRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40;
        }}
        role="log"
        aria-label={t.chatAria(t.team[team])}
        className={cn(
          "relative min-h-[140px] flex-1 overflow-y-auto overscroll-contain rounded-xl border border-line/50 bg-canvas/35 px-2 pb-2 pt-1",
          "max-h-[320px] lg:max-h-none lg:min-h-0",
          "[mask-image:linear-gradient(to_bottom,transparent_0,#000_8px,#000_100%)]",
        )}
      >
        <div ref={contentRef}>
        {thread.length === 0 && !typingSeat ? (
          <p className="py-6 text-center text-[12px] text-faint">{t.empty}</p>
        ) : (
          thread.map((item, index) => {
            if (item.kind === "turn") {
              return (
                <div key={item.id} className="mt-2.5 flex justify-center first:mt-1">
                  <span className="rounded-full border border-line/60 bg-panel/80 px-2 py-px text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">
                    {t.turnN(item.turn)}
                  </span>
                </div>
              );
            }
            if (item.kind === "forfeit") {
              return (
                <SystemLine
                  key={item.id}
                  tone="danger"
                  icon="⏱"
                  text={t.forfeits[item.reason]}
                />
              );
            }
            if (item.kind === "rejected") {
              // The referee's reason can name a hidden card (a clue too close
              // to one of the spymaster's own): a human operative sees only
              // that a move was rejected, like the models.
              const hideReason = hideAsides && item.seat === spymaster;
              return (
                <SystemLine
                  key={item.id}
                  tone="muted"
                  icon={item.transient ? <WifiOff size={10} /> : <RotateCcw size={10} />}
                  text={
                    item.transient
                      ? t.connection
                      : hideReason
                        ? t.rejected
                        : `${t.rejected}: ${item.message}`
                  }
                  title={hideReason ? undefined : item.message}
                />
              );
            }
            const from = sender(item);
            const previous = thread[index - 1];
            const next = thread[index + 1];
            const firstOfGroup = !previous || sender(previous) !== from;
            const lastOfGroup =
              (!next || sender(next) !== from) && !(index === thread.length - 1 && typingSeat === from);
            return (
              <Message
                key={item.id}
                item={item}
                team={team}
                config={configs[item.seat]}
                firstOfGroup={firstOfGroup}
                lastOfGroup={lastOfGroup}
                onShowReasoning={item.thought ? () => setReading(item) : undefined}
                animate={fresh.has(item.id)}
                showIntent={showIntent}
                hideAsides={hideAsides}
                focused={focusedClueId === item.id}
                onFocus={() =>
                  item.kind === "clue" &&
                  onFocusClue?.(focusedClueId === item.id ? null : item)
                }
              />
            );
          })
        )}
        {typingSeat && <TypingBubble seat={typingSeat} team={team} config={configs[typingSeat]} />}
        </div>
      </div>

      {state.turn.phase === "guess" && isActive && (
        <div className="relative flex items-center justify-between px-0.5 text-[12px]">
          <span className="text-faint">{t.attempts}</span>
          <span className="flex gap-1">
            {state.turn.clue?.number === 0 ? (
              <span className={cn("font-semibold", styles.text)}>∞</span>
            ) : (
              Array.from({ length: Math.max(0, state.turn.guessesLeft) }, (_, index) => (
                <span
                  key={index}
                  className={cn("size-2 rounded-full", styles.bar)}
                  style={{ boxShadow: `0 0 6px ${styles.color}` }}
                />
              ))
            )}
          </span>
        </div>
      )}

      <ReasoningModal
        item={reading}
        team={team}
        config={reading ? configs[reading.seat] : undefined}
        onClose={() => setReading(null)}
      />
    </aside>
  );
}
