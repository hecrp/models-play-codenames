"use client";

import { useState } from "react";
import { Hand, LoaderCircle, Send, Sparkles } from "lucide-react";
import type { GameState, Seat } from "@/lib/codenames/types";
import { teamOfSeat } from "@/lib/codenames/seats";
import {
  resolveHumanGuess,
  submitHumanAction,
  type HumanAction,
} from "@/lib/codenames/client-api";
import { cn } from "@/lib/utils";
import { useStrings, type Locale } from "@/lib/i18n";

const ES = {
  sendFailed: "No se pudo enviar la jugada.",
  notFound: (text: string) =>
    `No encuentro «${text}» entre las cartas. Escríbela de nuevo o haz clic en ella.`,
  resolveFailed: "No se pudo interpretar la carta.",
  panel: "Tu jugada",
  yourTurn: "Tu turno",
  spymaster: "jefe de espías",
  operative: "agente",
  teams: { red: "rojo", blue: "azul" },
  cluePlaceholder: "Pista (una palabra)",
  clueWord: "Palabra de la pista",
  clueNumber: "Número de cartas",
  tableComment: "Aparte para el público (tu agente no lo lee)",
  comment: "Comentario",
  giveClue: "Dar pista",
  cardPlaceholder: "Escribe una carta o haz clic en el tablero",
  cardToReveal: "Carta a revelar",
  commentOptional: "Comentario (opcional)",
  reveal: "Revelar",
  stopDisabled: "Debes intentar al menos una carta antes de plantarte",
  endTurn: "Terminar el turno",
  stop: "Plantarse",
  didYouMean: "¿Querías decir",
  yesReveal: "Sí, revelar",
  no: "No",
  resolving: "Interpretando lo que has escrito…",
};

const STRINGS: Record<Locale, typeof ES> = {
  es: ES,
  en: {
    sendFailed: "Could not send the move.",
    notFound: (text) =>
      `I can't find “${text}” among the cards. Type it again or click on it.`,
    resolveFailed: "Could not interpret the card.",
    panel: "Your move",
    yourTurn: "Your turn",
    spymaster: "spymaster",
    operative: "operative",
    teams: { red: "red", blue: "blue" },
    cluePlaceholder: "Clue (one word)",
    clueWord: "Clue word",
    clueNumber: "Number of cards",
    tableComment: "Aside for the audience (your operative won't read it)",
    comment: "Comment",
    giveClue: "Give clue",
    cardPlaceholder: "Type a card or click on the board",
    cardToReveal: "Card to reveal",
    commentOptional: "Comment (optional)",
    reveal: "Reveal",
    stopDisabled: "You must try at least one card before stopping",
    endTurn: "End the turn",
    stop: "Stop",
    didYouMean: "Did you mean",
    yesReveal: "Yes, reveal",
    no: "No",
    resolving: "Interpreting what you typed…",
  },
};

const inputClass =
  "h-9 min-w-0 rounded-lg border border-line bg-canvas px-2.5 text-[14px] outline-none transition-colors focus:border-accent/60";

/** Turn controls for the person playing a seat. Board clicks go through `onGuess`. */
export function useHumanActions(gameId: string) {
  const t = useStrings(STRINGS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [say, setSay] = useState("");

  const send = async (action: HumanAction) => {
    setBusy(true);
    setError(null);
    try {
      const trimmed = say.trim();
      await submitHumanAction(gameId, trimmed ? { ...action, say: trimmed } : action);
      setSay("");
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t.sendFailed);
      return false;
    } finally {
      setBusy(false);
    }
  };

  return { busy, error, setError, say, setSay, send };
}

export type HumanActions = ReturnType<typeof useHumanActions>;

export function HumanPanel({
  gameId,
  apiKey,
  seat,
  state,
  actions,
}: {
  gameId: string;
  apiKey: string;
  seat: Seat;
  state: GameState;
  actions: HumanActions;
}) {
  const t = useStrings(STRINGS);
  const team = teamOfSeat(seat);
  const isSpymaster = seat.endsWith("spymaster");
  const [word, setWord] = useState("");
  const [number, setNumber] = useState(1);
  const [typed, setTyped] = useState("");
  const [resolving, setResolving] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const teamColor = team === "red" ? "var(--team-red)" : "var(--team-blue)";
  const busy = actions.busy || resolving;

  const giveClue = async () => {
    if (!word.trim()) return;
    if (await actions.send({ type: "give_clue", word: word.trim(), number })) setWord("");
  };

  const guess = async (card: string) => {
    setSuggestion(null);
    if (await actions.send({ type: "guess", word: card })) setTyped("");
  };

  const tryTyped = async () => {
    const text = typed.trim();
    if (!text) return;
    setResolving(true);
    actions.setError(null);
    setSuggestion(null);
    try {
      const resolution = await resolveHumanGuess(gameId, text, apiKey);
      if (resolution.kind === "exact") await guess(resolution.word);
      else if (resolution.kind === "suggestion") setSuggestion(resolution.word);
      else actions.setError(t.notFound(text));
    } catch (caught) {
      actions.setError(caught instanceof Error ? caught.message : t.resolveFailed);
    } finally {
      setResolving(false);
    }
  };

  return (
    <section
      className="glass animate-pop w-full rounded-2xl border px-3 py-2.5"
      style={{
        borderColor: `color-mix(in oklab, ${teamColor} 55%, transparent)`,
        boxShadow: `0 0 30px -14px ${teamColor}`,
      }}
      aria-label={t.panel}
    >
      <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.14em]" style={{ color: teamColor }}>
        <Sparkles size={12} />
        {t.yourTurn} · {isSpymaster ? t.spymaster : t.operative} {t.teams[team]}
      </p>

      {isSpymaster ? (
        <form
          className="mt-2 flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void giveClue();
          }}
        >
          <input
            value={word}
            onChange={(event) => setWord(event.target.value)}
            placeholder={t.cluePlaceholder}
            maxLength={30}
            autoFocus
            aria-label={t.clueWord}
            className={cn(inputClass, "w-44 flex-1 font-display uppercase tracking-wider")}
          />
          <select
            value={number}
            onChange={(event) => setNumber(Number(event.target.value))}
            aria-label={t.clueNumber}
            className={cn(inputClass, "w-20")}
          >
            {Array.from({ length: 10 }, (_, value) => (
              <option key={value} value={value}>
                {value === 0 ? "0 (∞)" : value}
              </option>
            ))}
          </select>
          <input
            value={actions.say}
            onChange={(event) => actions.setSay(event.target.value)}
            placeholder={t.tableComment}
            maxLength={180}
            aria-label={t.comment}
            className={cn(inputClass, "w-56 flex-[2]")}
          />
          <button
            type="submit"
            disabled={busy || !word.trim()}
            className="btn-glow inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-[13px] font-semibold text-accent-ink disabled:opacity-40"
          >
            {busy ? <LoaderCircle size={14} className="animate-spin" /> : <Send size={14} />}
            {t.giveClue}
          </button>
        </form>
      ) : (
        <>
          <form
            className="mt-2 flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void tryTyped();
            }}
          >
            <input
              value={typed}
              onChange={(event) => {
                setTyped(event.target.value);
                setSuggestion(null);
              }}
              placeholder={t.cardPlaceholder}
              maxLength={60}
              autoFocus
              aria-label={t.cardToReveal}
              className={cn(inputClass, "w-52 flex-1 uppercase")}
            />
            <input
              value={actions.say}
              onChange={(event) => actions.setSay(event.target.value)}
              placeholder={t.commentOptional}
              maxLength={180}
              aria-label={t.comment}
              className={cn(inputClass, "w-48 flex-1")}
            />
            <button
              type="submit"
              disabled={busy || !typed.trim()}
              className="btn-glow inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-[13px] font-semibold text-accent-ink disabled:opacity-40"
            >
              {busy ? <LoaderCircle size={14} className="animate-spin" /> : <Send size={14} />}
              {t.reveal}
            </button>
            <button
              type="button"
              onClick={() => void actions.send({ type: "stop" })}
              disabled={busy || state.turn.guessesMade === 0}
              title={
                state.turn.guessesMade === 0
                  ? t.stopDisabled
                  : t.endTurn
              }
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-elevated px-3 text-[13px] font-medium text-ink-soft transition-colors hover:bg-hover disabled:opacity-40"
            >
              <Hand size={14} />
              {t.stop}
            </button>
          </form>
          {suggestion && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
              <span className="text-muted">{t.didYouMean}</span>
              <span className="font-display font-semibold uppercase tracking-wider text-ink">
                {suggestion}
              </span>
              <span className="text-muted">?</span>
              <button
                type="button"
                onClick={() => void guess(suggestion)}
                disabled={busy}
                className="rounded-lg bg-accent px-2.5 py-1 text-[12.5px] font-semibold text-accent-ink disabled:opacity-40"
              >
                {t.yesReveal}
              </button>
              <button
                type="button"
                onClick={() => setSuggestion(null)}
                className="rounded-lg border border-line px-2.5 py-1 text-[12.5px] text-muted hover:bg-hover"
              >
                {t.no}
              </button>
            </div>
          )}
          {resolving && (
            <p className="mt-1.5 text-[12px] text-faint">{t.resolving}</p>
          )}
        </>
      )}

      {actions.error && (
        <p className="mt-1.5 text-[12.5px] text-danger" role="alert">
          {actions.error}
        </p>
      )}
    </section>
  );
}
