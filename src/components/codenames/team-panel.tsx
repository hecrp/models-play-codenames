"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Crown, Eye } from "lucide-react";
import type {
  GameState,
  GuessResult,
  Seat,
  SeatConfig,
  StoredGameEvent,
  Team,
} from "@/lib/codenames/types";
import { avatarById } from "@/lib/codenames/avatars";
import { operativeSeat, spymasterSeat } from "@/lib/codenames/seats";
import { useStrings, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Avatar } from "./avatar";
import { SpeechBubble } from "./game-log";

type SeatError = "clue_failed" | "attempts_exhausted";

const ES = {
  team: { red: "rojo", blue: "azul" } as Record<Team, string>,
  teamAria: (team: string) => `Equipo ${team}`,
  guessLabels: {
    own: "acierto",
    opponent: "del rival",
    neutral: "neutral",
    assassin: "asesino",
  } as Record<GuessResult, string>,
  errors: {
    clue_failed: "Pista fallida: pierde el turno",
    attempts_exhausted: "Sin jugada válida: pierde el turno",
  } as Record<SeatError, string>,
  thisTurn: "Este turno",
  turnN: (turn: number) => `Turno ${turn}`,
  clue: "Pista",
  unlimited: "sin límite",
  stops: "✋ Se planta",
  spymaster: "Jefe de espías",
  operative: "Agente",
  youPlay: "juegas tú",
  yourTurn: "Su turno",
  waitingYou: "Esperando tu jugada…",
  thinkingClue: "Pensando una pista…",
  choosingCard: "Eligiendo carta…",
  notPlayed: "Aún no ha jugado.",
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
    guessLabels: {
      own: "correct",
      opponent: "opponent's",
      neutral: "neutral",
      assassin: "assassin",
    },
    errors: {
      clue_failed: "Failed clue: loses the turn",
      attempts_exhausted: "No valid move: loses the turn",
    },
    thisTurn: "This turn",
    turnN: (turn) => `Turn ${turn}`,
    clue: "Clue",
    unlimited: "unlimited",
    stops: "✋ Stops",
    spymaster: "Spymaster",
    operative: "Operative",
    youPlay: "you play",
    yourTurn: "Playing",
    waitingYou: "Waiting for your move…",
    thinkingClue: "Thinking of a clue…",
    choosingCard: "Choosing a card…",
    notPlayed: "Hasn't played yet.",
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
    soft: "bg-team-red/10",
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
    soft: "bg-team-blue/10",
    bar: "bg-team-blue",
    glow: "shadow-[0_0_44px_-14px_var(--team-blue)]",
    color: "var(--team-blue)",
    gradient:
      "bg-[linear-gradient(160deg,color-mix(in_oklab,var(--team-blue)_16%,transparent),transparent_55%)]",
  },
} as const;

export interface SeatAction {
  seat: Seat;
  turn: number;
  clue?: { word: string; number: number };
  guesses: Array<{ word: string; result: GuessResult }>;
  stopped: boolean;
  error?: SeatError;
  say?: string;
}

const GUESS_STYLES: Record<GuessResult, { className: string }> = {
  own: { className: "border-accent/30 bg-accent-soft text-accent" },
  opponent: {
    className: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300",
  },
  neutral: { className: "border-line-strong bg-panel text-muted" },
  assassin: { className: "border-danger/40 bg-danger/10 text-danger" },
};

/** Latest turn played by each seat, grouped so a whole turn reads as one block. */
export function lastActions(
  events: StoredGameEvent[],
): Partial<Record<Seat, SeatAction>> {
  const actions: Partial<Record<Seat, SeatAction>> = {};
  let turn = 1;
  const entry = (seat: Seat): SeatAction => {
    const current = actions[seat];
    if (current && current.turn === turn) return current;
    const fresh: SeatAction = { seat, turn, guesses: [], stopped: false };
    actions[seat] = fresh;
    return fresh;
  };

  for (const event of events) {
    if (event.type === "turn_started") {
      turn = event.data.turn;
    } else if (event.type === "clue_given") {
      const action = entry(event.seat);
      action.clue = { word: event.data.word, number: event.data.number };
      action.say = event.data.say;
    } else if (event.type === "guess_made") {
      const action = entry(event.seat);
      action.guesses.push({ word: event.data.word, result: event.data.result });
      if (event.data.say) action.say = event.data.say;
    } else if (event.type === "turn_ended" && event.seat) {
      if (event.data.reason === "stopped") {
        const action = entry(event.seat);
        action.stopped = true;
        if (event.data.say) action.say = event.data.say;
      } else if (event.data.reason === "clue_failed") {
        entry(event.seat).error = "clue_failed";
      } else if (event.data.reason === "attempts_exhausted") {
        entry(event.seat).error = "attempts_exhausted";
      }
    }
  }
  return actions;
}

function SeatMove({
  action,
  team,
  isSpymaster,
  current,
}: {
  action: SeatAction;
  team: Team;
  isSpymaster: boolean;
  current: boolean;
}) {
  const t = useStrings(STRINGS);
  const styles = TEAM_STYLES[team];
  return (
    <div className="space-y-1.5">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-faint">
        {current ? t.thisTurn : t.turnN(action.turn)}
      </p>

      {isSpymaster && action.clue && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted">{t.clue}</span>
          <span className="truncate font-display text-[17px] font-semibold uppercase leading-none tracking-wider text-ink">
            {action.clue.word}
          </span>
          <span
            className={cn(
              "grid size-6 shrink-0 place-items-center rounded-md text-[12px] font-bold text-white",
              styles.bar,
            )}
          >
            {action.clue.number}
          </span>
          {action.clue.number === 0 && (
            <span className="text-[10.5px] text-faint">{t.unlimited}</span>
          )}
        </div>
      )}

      {!isSpymaster && action.guesses.length > 0 && (
        <ol className="space-y-1">
          {action.guesses.map((guess, index) => {
            const style = GUESS_STYLES[guess.result];
            return (
              <li key={`${guess.word}-${index}`} className="flex items-center gap-2">
                <span className="w-3 shrink-0 text-right font-mono text-[10.5px] text-faint">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate font-display text-[14px] font-medium uppercase tracking-wider text-ink">
                  {guess.word}
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-1.5 py-px text-[10.5px] font-semibold",
                    style.className,
                  )}
                >
                  {t.guessLabels[guess.result]}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {action.stopped && (
        <p className="text-[12px] font-medium text-muted">{t.stops}</p>
      )}
      {action.error && (
        <p className="text-[12px] font-medium text-danger">{t.errors[action.error]}</p>
      )}

      {action.say && <SpeechBubble text={action.say} team={team} />}
    </div>
  );
}

const GUESS_DOT: Record<GuessResult, string> = {
  own: "bg-accent",
  opponent: "bg-amber-500",
  neutral: "bg-line-strong",
  assassin: "bg-danger",
};

function SeatSummary({ action, isSpymaster }: { action: SeatAction; isSpymaster: boolean }) {
  const t = useStrings(STRINGS);
  return (
    <p className="flex min-w-0 items-center gap-1.5 text-[12px] text-muted">
      <span className="shrink-0 font-mono text-[10.5px] text-faint">T{action.turn}</span>
      {isSpymaster && action.clue ? (
        <span className="truncate font-display font-semibold uppercase tracking-wider text-ink">
          {action.clue.word} · {action.clue.number}
        </span>
      ) : null}
      {!isSpymaster && action.guesses.length > 0 && (
        <span className="flex min-w-0 items-center gap-1 truncate">
          <span className="truncate font-display uppercase tracking-wider text-ink">
            {action.guesses.map((guess) => guess.word).join(", ")}
          </span>
          {action.guesses.map((guess, index) => (
            <span key={index} className={cn("size-1.5 shrink-0 rounded-full", GUESS_DOT[guess.result])} />
          ))}
        </span>
      )}
      {action.stopped && <span className="shrink-0">✋</span>}
      {action.error && <span className="truncate text-danger">{t.errors[action.error]}</span>}
    </p>
  );
}

function SeatCard({
  config,
  seat,
  team,
  thinking,
  action,
  active,
  currentTurn,
}: {
  config: SeatConfig;
  seat: Seat;
  team: Team;
  thinking: Seat | null;
  action: SeatAction | undefined;
  active: boolean;
  currentTurn: number;
}) {
  const t = useStrings(STRINGS);
  const avatar = avatarById(config.avatarId);
  const styles = TEAM_STYLES[team];
  const isSpymaster = seat === spymasterSeat(team);
  const isThinking = thinking === seat;
  const [override, setOverride] = useState<boolean | null>(null);
  useEffect(() => {
    setOverride(null);
  }, [active]);
  const expanded = override ?? (active || isThinking);

  if (!avatar) return null;

  return (
    <div
      className={cn(
        "relative flex shrink-0 flex-col overflow-hidden rounded-xl border transition-all duration-300 lg:flex-1",
        active
          ? cn(styles.activeBorder, "bg-elevated/80", styles.glow)
          : "border-line/70 bg-canvas/40",
      )}
    >
      {active && (
        <span
          className={cn("pointer-events-none absolute inset-0", styles.gradient)}
          aria-hidden="true"
        />
      )}
      <button
        type="button"
        onClick={() => setOverride(!expanded)}
        aria-expanded={expanded}
        className="relative flex w-full items-center gap-2.5 p-2 text-left"
      >
        <span
          className={cn("block shrink-0", isThinking && "aura")}
          style={{ "--aura": styles.color } as React.CSSProperties}
        >
          <Avatar
            avatar={avatar}
            team={team}
            size={expanded ? 40 : 30}
            active={active || isThinking}
            className={cn(isThinking && "animate-float")}
          />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            {isSpymaster ? (
              <Crown size={11} className={styles.text} />
            ) : (
              <Eye size={11} className={styles.text} />
            )}
            <span className={cn("text-[10.5px] font-semibold uppercase tracking-[0.14em]", styles.text)}>
              {isSpymaster ? t.spymaster : t.operative}
            </span>
          </div>
          <p className="truncate text-[14px] font-semibold leading-tight text-ink">
            {config.displayName}
          </p>
          {expanded && (
            <p className="truncate font-mono text-[10px] text-faint" title={config.modelId}>
              {config.human ? t.youPlay : config.modelId}
            </p>
          )}
        </div>
        {active && !isThinking && (
          <span
            className={cn(
              "shrink-0 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold",
              styles.activeBorder,
              styles.text,
            )}
          >
            {t.yourTurn}
          </span>
        )}
        <ChevronDown
          size={14}
          className={cn("shrink-0 text-faint transition-transform", expanded && "rotate-180")}
        />
      </button>

      <div
        className={cn(
          "relative flex-1 border-t px-2.5",
          expanded ? "py-2" : "py-1.5",
          active ? "border-line/60" : "border-line/40",
          !active && !isThinking && "opacity-75",
        )}
      >
        {isThinking ? (
          <p className="flex items-center gap-2 text-[12.5px] font-medium">
            <span className="flex items-center gap-0.5">
              <span className="typing-dot !size-1" />
              <span className="typing-dot !size-1" style={{ animationDelay: "120ms" }} />
              <span className="typing-dot !size-1" style={{ animationDelay: "240ms" }} />
            </span>
            <span className="shimmer-text">
              {config.human
                ? t.waitingYou
                : isSpymaster
                  ? t.thinkingClue
                  : t.choosingCard}
            </span>
          </p>
        ) : action ? (
          expanded ? (
            <div key={`${action.turn}-${action.guesses.length}-${action.say ?? ""}`} className="animate-pop">
              <SeatMove
                action={action}
                team={team}
                isSpymaster={isSpymaster}
                current={action.turn === currentTurn}
              />
            </div>
          ) : (
            <SeatSummary action={action} isSpymaster={isSpymaster} />
          )
        ) : (
          <p className="text-[12px] text-faint">{t.notPlayed}</p>
        )}
      </div>
    </div>
  );
}

export function TeamPanel({
  team,
  configs,
  state,
  thinking,
  activeTeam,
  actions,
  className,
}: {
  team: Team;
  configs: Record<Seat, SeatConfig>;
  state: GameState;
  thinking: Seat | null;
  activeTeam: Team;
  actions: Partial<Record<Seat, SeatAction>>;
  className?: string;
}) {
  const t = useStrings(STRINGS);
  const spymaster = spymasterSeat(team);
  const operative = operativeSeat(team);
  const total = team === state.startingTeam ? 9 : 8;
  // Hidden colors may be redacted for a human operative, so count reveals instead.
  const remaining =
    total - state.board.filter((card) => card.color === team && card.revealed).length;
  const styles = TEAM_STYLES[team];
  const isActive = activeTeam === team && state.status !== "finished";
  const actingSeat =
    state.turn.team === team
      ? state.turn.phase === "clue"
        ? spymaster
        : operative
      : null;

  return (
    <aside
      className={cn(
        "glass relative flex min-w-0 flex-col gap-2 rounded-2xl border p-2.5 transition-all duration-500 lg:max-h-full lg:overflow-y-auto lg:overscroll-contain",
        isActive ? cn(styles.activeBorder, styles.glow, "live-border") : cn(styles.border, "opacity-90"),
        className,
      )}
      style={{ "--live": styles.color } as React.CSSProperties}
      aria-label={t.teamAria(t.team[team])}
    >
      <span
        className={cn("pointer-events-none absolute inset-0 rounded-2xl", styles.gradient)}
        aria-hidden="true"
      />
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
            style={
              index < remaining
                ? { boxShadow: `0 0 8px -1px ${styles.color}` }
                : undefined
            }
          />
        ))}
      </div>

      <SeatCard
        config={configs[spymaster]}
        seat={spymaster}
        team={team}
        thinking={thinking}
        action={actions[spymaster]}
        active={actingSeat === spymaster}
        currentTurn={state.turnsPlayed}
      />
      <SeatCard
        config={configs[operative]}
        seat={operative}
        team={team}
        thinking={thinking}
        action={actions[operative]}
        active={actingSeat === operative}
        currentTurn={state.turnsPlayed}
      />

      {state.turn.phase === "guess" && state.turn.team === team && (
        <div className="relative mt-auto flex items-center justify-between px-0.5 pt-1 text-[12px]">
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
    </aside>
  );
}

export { TEAM_STYLES };
