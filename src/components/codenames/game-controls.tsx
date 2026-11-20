"use client";

import { useEffect, useState } from "react";
import {
  Eye,
  EyeOff,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  Square,
  Wifi,
  WifiOff,
} from "lucide-react";
import { IconButton, Modal, Segmented } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { CodenamesConnection } from "@/hooks/use-codenames-game";
import { useStrings, type Locale } from "@/lib/i18n";

const ES = {
  connection: {
    live: "En vivo",
    reconnecting: "Reconectando",
    connecting: "Conectando",
    error: "Error",
    closed: "Desconectado",
  } as Record<CodenamesConnection, string>,
  play: "Reproducir",
  pauseAria: "Pausar",
  pause: "Pausa",
  step: "Paso a paso",
  restartReplay: "Reiniciar replay",
  speed: "Velocidad",
  hideColors: "Ocultar colores ocultos",
  godModeTitle: "Modo dios: ver colores",
  god: "Dios",
  abort: "Abortar",
  replay: "Replay",
  abortLabel: "Abortar partida",
  abortTitle: "¿Abortar la partida?",
  abortBody:
    "Se detendrán las llamadas a los modelos y la partida quedará registrada como abortada. Esta acción no se puede deshacer.",
  cancel: "Cancelar",
  turn: { red: "Turno rojo", blue: "Turno azul" },
  clue: "Pista",
  unlimitedTitle: "Pista 0: intentos sin límite",
  unlimited: "∞ intentos",
  guessesLeftTitle: (n: number) => `${n} intentos restantes`,
  guesses: (n: number) => `${n} intento${n === 1 ? "" : "s"}`,
  thinkingClue: "El jefe de espías está pensando una pista…",
  waitingClue: "Esperando la pista…",
};

const STRINGS: Record<Locale, typeof ES> = {
  es: ES,
  en: {
    connection: {
      live: "Live",
      reconnecting: "Reconnecting",
      connecting: "Connecting",
      error: "Error",
      closed: "Disconnected",
    },
    play: "Play",
    pauseAria: "Pause",
    pause: "Pause",
    step: "Step",
    restartReplay: "Restart replay",
    speed: "Speed",
    hideColors: "Hide hidden colors",
    godModeTitle: "God mode: show colors",
    god: "God",
    abort: "Abort",
    replay: "Replay",
    abortLabel: "Abort game",
    abortTitle: "Abort the game?",
    abortBody:
      "Model calls will stop and the game will be recorded as aborted. This action cannot be undone.",
    cancel: "Cancel",
    turn: { red: "Red turn", blue: "Blue turn" },
    clue: "Clue",
    unlimitedTitle: "Clue 0: unlimited guesses",
    unlimited: "∞ guesses",
    guessesLeftTitle: (n) => `${n} guesses left`,
    guesses: (n) => `${n} guess${n === 1 ? "" : "es"}`,
    thinkingClue: "The spymaster is thinking of a clue…",
    waitingClue: "Waiting for the clue…",
  },
};

const SPEEDS = [0.25, 0.5, 1, 2];

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    tag === "BUTTON" ||
    tag === "A" ||
    target.isContentEditable
  );
}

export function GameControls({
  mode,
  paused,
  speed,
  godMode,
  connection,
  disabled = false,
  onTogglePlay,
  onStep,
  onAbort,
  onRestart,
  onSpeed,
  onToggleGod,
  godLocked = false,
  className,
}: {
  mode: "live" | "replay";
  paused: boolean;
  speed: number;
  godMode: boolean;
  connection: CodenamesConnection;
  disabled?: boolean;
  onTogglePlay: () => void;
  onStep: () => void;
  onAbort?: () => void;
  onRestart?: () => void;
  onSpeed: (speed: number) => void;
  onToggleGod: () => void;
  godLocked?: boolean;
  className?: string;
}) {
  const t = useStrings(STRINGS);
  const [confirmAbort, setConfirmAbort] = useState(false);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (event.key === " " || event.code === "Space") {
        event.preventDefault();
        onTogglePlay();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        onStep();
      } else if (event.key.toLowerCase() === "g" && !godLocked) {
        onToggleGod();
      } else if (event.key === "Escape") {
        setConfirmAbort(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [godLocked, onStep, onToggleGod, onTogglePlay]);

  const connectionLabel = t.connection[connection];

  return (
    <>
      <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
        <button
          type="button"
          onClick={onTogglePlay}
          disabled={disabled}
          aria-label={paused ? t.play : t.pauseAria}
          className={cn(
            "btn-glow inline-flex h-9 items-center gap-1.5 rounded-xl bg-accent px-3.5 text-[12.5px] font-semibold text-accent-ink disabled:pointer-events-none disabled:opacity-40",
            paused && !disabled && "btn-shine",
          )}
        >
          {paused ? <Play size={13} /> : <Pause size={13} />}
          <span className="hidden sm:inline">{paused ? t.play : t.pause}</span>
        </button>

        <IconButton label={t.step} onClick={onStep} disabled={disabled}>
          <SkipForward size={15} />
        </IconButton>

        {mode === "replay" && onRestart && (
          <IconButton label={t.restartReplay} onClick={onRestart} disabled={disabled}>
            <RotateCcw size={15} />
          </IconButton>
        )}

        <div>
          <Segmented
            ariaLabel={t.speed}
            value={String(speed)}
            disabled={disabled}
            onChange={(value) => onSpeed(Number(value))}
            options={SPEEDS.map((value) => ({
              value: String(value),
              label: `${value}×`,
            }))}
          />
        </div>

        {!godLocked && (
        <button
          type="button"
          onClick={onToggleGod}
          aria-pressed={godMode}
          title={godMode ? t.hideColors : t.godModeTitle}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-[12px] font-medium transition-colors",
            godMode
              ? "border-violet-500/40 bg-violet-500/15 text-violet-600 shadow-[0_0_18px_-6px_rgb(139,92,246)] dark:text-violet-300"
              : "border-line bg-elevated text-muted hover:text-ink",
          )}
        >
          {godMode ? <Eye size={13} /> : <EyeOff size={13} />}
          <span className="hidden md:inline">{t.god}</span>
        </button>
        )}

        {mode === "live" && (
          <button
            type="button"
            onClick={() => setConfirmAbort(true)}
            disabled={disabled}
            className="inline-flex h-9 items-center gap-1 rounded-xl border border-line bg-elevated px-2.5 text-[12px] font-medium text-muted transition-colors hover:border-danger/40 hover:text-danger disabled:pointer-events-none disabled:opacity-40"
          >
            <Square size={11} />
            <span className="hidden md:inline">{t.abort}</span>
          </button>
        )}

        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-medium",
            connection === "live"
              ? "border-accent/30 bg-accent-soft text-accent"
              : connection === "error"
                ? "border-danger/30 bg-danger/5 text-danger"
                : "border-line bg-elevated text-muted",
          )}
        >
          {connection === "live" ? (
            <span className="live-dot !size-1.5" />
          ) : connection === "reconnecting" || connection === "connecting" ? (
            <Wifi size={10} className="animate-pulse" />
          ) : (
            <WifiOff size={10} />
          )}
          {mode === "replay" ? t.replay : connectionLabel}
        </span>
      </div>

      <Modal
        open={confirmAbort}
        onClose={() => setConfirmAbort(false)}
        label={t.abortLabel}
      >
        <div className="p-5">
          <h2 className="text-[16px] font-semibold">{t.abortTitle}</h2>
          <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
            {t.abortBody}
          </p>
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmAbort(false)}
              className="rounded-lg px-3 py-1.5 text-[12.5px] text-muted transition-colors hover:bg-hover hover:text-ink"
            >
              {t.cancel}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmAbort(false);
                onAbort?.();
              }}
              className="rounded-lg bg-danger px-3 py-1.5 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              {t.abort}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export function ClueBanner({
  team,
  phase,
  clue,
  guessesLeft,
  turn,
  lastError,
}: {
  team: "red" | "blue";
  phase: "clue" | "guess";
  clue: { word: string; number: number; say?: string } | null;
  guessesLeft: number;
  turn?: number;
  lastError?: string | null;
}) {
  const t = useStrings(STRINGS);
  const teamText = team === "red" ? "text-team-red-ink" : "text-team-blue-ink";
  const teamBg = team === "red" ? "bg-team-red" : "bg-team-blue";
  const teamColor = team === "red" ? "var(--team-red)" : "var(--team-blue)";

  return (
    <div
      className="glass relative flex min-w-0 flex-1 flex-col gap-1.5 overflow-hidden rounded-2xl border px-2 py-1.5"
      style={{
        borderColor: `color-mix(in oklab, ${teamColor} 45%, transparent)`,
        boxShadow: `0 0 36px -18px ${teamColor}`,
      }}
    >
      <span
        key={team}
        className="turn-sweep"
        style={{ "--sweep": teamColor } as React.CSSProperties}
        aria-hidden="true"
      />

      <div className="relative flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
        <span
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-2 rounded-lg px-2.5 text-white",
            teamBg,
          )}
          style={{ boxShadow: `0 4px 16px -6px ${teamColor}` }}
        >
          <span className="live-dot !size-1.5 text-white" />
          <span className="font-display text-[12.5px] font-semibold uppercase tracking-[0.14em]">
            {t.turn[team]}
          </span>
        </span>

        {turn !== undefined && (
          <span className="shrink-0 rounded-full border border-line bg-canvas/60 px-2 py-0.5 font-mono text-[10.5px] tabular-nums text-faint">
            #{turn}
          </span>
        )}

        {clue ? (
          <>
            <span className="inline-flex min-w-0 items-baseline gap-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-faint">
                {t.clue}
              </span>
              <span className="font-display text-[22px] font-semibold uppercase leading-none tracking-[0.06em] text-ink">
                {clue.word}
              </span>
              <span
                className={cn(
                  "grid size-7 place-items-center rounded-md font-display text-[15px] font-bold text-white",
                  teamBg,
                )}
                style={{ boxShadow: `0 0 16px -4px ${teamColor}` }}
              >
                {clue.number}
              </span>
            </span>
            {clue.number === 0 ? (
              <span className="text-[11.5px] text-muted" title={t.unlimitedTitle}>
                {t.unlimited}
              </span>
            ) : (
            <span className="flex items-center gap-1" title={t.guessesLeftTitle(guessesLeft)}>
              {Array.from({ length: Math.max(0, guessesLeft) }, (_, index) => (
                <span
                  key={index}
                  className={cn("size-2 rounded-full", teamBg)}
                  style={{ boxShadow: `0 0 6px ${teamColor}` }}
                />
              ))}
              <span className="ml-1 text-[11.5px] text-muted">
                {t.guesses(guessesLeft)}
              </span>
            </span>
            )}
          </>
        ) : (
          <span className={cn("shimmer-text min-w-0 text-[13.5px] font-medium", teamText)}>
            {phase === "clue"
              ? t.thinkingClue
              : t.waitingClue}
          </span>
        )}

        {lastError && (
          <span
            className="ml-auto max-w-[42ch] truncate rounded-full border border-danger/30 bg-danger/10 px-2 py-0.5 text-[11.5px] text-danger"
            title={lastError}
          >
            {lastError}
          </span>
        )}
      </div>

      {clue?.say && (
        <p
          key={clue.say}
          className="animate-clue-in relative hidden rounded-lg border-l-2 bg-canvas/40 px-2.5 py-1 text-[12.5px] italic leading-snug text-ink-soft xl:block"
          style={{
            borderColor: teamColor,
            background: `color-mix(in oklab, ${teamColor} 7%, transparent)`,
          }}
        >
          “{clue.say}”
        </p>
      )}
    </div>
  );
}
