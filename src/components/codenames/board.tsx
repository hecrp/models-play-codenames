"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Droplet, Fingerprint, Flame, Minus, Skull } from "lucide-react";
import type { BoardCard, Team } from "@/lib/codenames/types";
import type { ClueTarget, TargetOutcome } from "@/lib/codenames/team-thread";
import { cn } from "@/lib/utils";
import { useStrings, type Locale } from "@/lib/i18n";

const ES = {
  colors: {
    red: "rojo",
    blue: "azul",
    neutral: "neutral",
    assassin: "asesino",
  } as Record<BoardCard["color"], string>,
  revealed: (word: string, color: string) => `${word}, carta ${color}`,
  hiddenGod: (word: string, color: string) => `${word}, oculta, color real ${color}`,
  hidden: (word: string) => `${word}, oculta`,
  pick: (word: string) => `Elegir ${word}`,
  board: "Tablero de Codenames",
  targetOf: (clue: string) => `Objetivo de la pista ${clue}`,
};

const STRINGS: Record<Locale, typeof ES> = {
  es: ES,
  en: {
    colors: {
      red: "red",
      blue: "blue",
      neutral: "neutral",
      assassin: "assassin",
    },
    revealed: (word, color) => `${word}, ${color} card`,
    hiddenGod: (word, color) => `${word}, hidden, actual color ${color}`,
    hidden: (word) => `${word}, hidden`,
    pick: (word) => `Pick ${word}`,
    board: "Codenames board",
    targetOf: (clue) => `Target of the clue ${clue}`,
  },
};

const COLOR_STYLES: Record<
  BoardCard["color"],
  { back: string; Icon: typeof Flame; tone: string }
> = {
  red: {
    back: "cn-back-red",
    Icon: Flame,
    tone: "var(--card-red)",
  },
  blue: {
    back: "cn-back-blue",
    Icon: Droplet,
    tone: "var(--card-blue)",
  },
  neutral: {
    back: "cn-back-neutral",
    Icon: Minus,
    tone: "color-mix(in oklab, var(--card-neutral-ink) 55%, transparent)",
  },
  assassin: {
    back: "cn-back-assassin",
    Icon: Skull,
    tone: "#ef4444",
  },
};

const BURST_COUNT = 14;

function burstVectors() {
  return Array.from({ length: BURST_COUNT }, (_, index) => {
    const angle = (index / BURST_COUNT) * Math.PI * 2 + Math.random() * 0.4;
    const distance = 38 + Math.random() * 46;
    return {
      dx: `${Math.cos(angle) * distance}px`,
      dy: `${Math.sin(angle) * distance}px`,
      rot: `${Math.round(Math.random() * 360)}deg`,
      size: 4 + Math.round(Math.random() * 5),
    };
  });
}

/** Badge on a card a focused clue aimed at, by what became of it. */
export const TARGET_MARKS: Record<TargetOutcome, { icon: string; color: string }> = {
  hit: { icon: "✓", color: "var(--accent)" },
  later: { icon: "↻", color: "color-mix(in oklab, var(--accent) 65%, var(--muted))" },
  rival: { icon: "✗", color: "#f59e0b" },
  pending: { icon: "?", color: "var(--muted)" },
};

/** A clue whose targets the board is showing. */
export interface BoardFocus {
  team: Team;
  clue: string;
  targets: ClueTarget[];
}

export function Card({
  card,
  index,
  godMode,
  highlight,
  onPick,
  mark,
}: {
  card: BoardCard;
  index: number;
  godMode: boolean;
  highlight: boolean;
  onPick?: (card: BoardCard) => void;
  /** Set when the focused clue aimed at this card. */
  mark?: { outcome: TargetOutcome; team: Team; clue: string };
}) {
  const [burst, setBurst] = useState<ReturnType<typeof burstVectors> | null>(
    null,
  );
  const wasRevealed = useRef(card.revealed);

  useEffect(() => {
    if (!wasRevealed.current && card.revealed) {
      wasRevealed.current = true;
      setBurst(burstVectors());
      const timer = window.setTimeout(() => setBurst(null), 1400);
      return () => window.clearTimeout(timer);
    }
    wasRevealed.current = card.revealed;
    return undefined;
  }, [card.revealed]);

  const t = useStrings(STRINGS);
  const style = COLOR_STYLES[card.color];
  const Icon = style.Icon;
  const colorLabel = t.colors[card.color];
  const label = card.revealed
    ? t.revealed(card.word, colorLabel)
    : godMode
      ? t.hiddenGod(card.word, colorLabel)
      : t.hidden(card.word);

  const pickable = Boolean(onPick) && !card.revealed;

  return (
    <div
      role="gridcell"
      aria-label={pickable ? t.pick(card.word) : label}
      title={card.word}
      tabIndex={pickable ? 0 : undefined}
      onClick={pickable ? () => onPick?.(card) : undefined}
      onKeyDown={
        pickable
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onPick?.(card);
              }
            }
          : undefined
      }
      style={
        {
          "--i": index,
          ...(mark
            ? {
                "--target-ring": mark.team === "red" ? "var(--team-red)" : "var(--team-blue)",
                "--target-color": TARGET_MARKS[mark.outcome].color,
              }
            : {}),
        } as React.CSSProperties
      }
      className={cn(
        "cn-card aspect-[1.3] select-none sm:aspect-[1.45]",
        card.revealed && "is-revealed",
        highlight && "is-highlight",
        mark && "is-target",
        pickable &&
          "cursor-pointer rounded-lg outline-none transition-transform hover:-translate-y-0.5 hover:ring-2 hover:ring-accent/70 focus-visible:ring-2 focus-visible:ring-accent",
      )}
    >
      {mark && (
        <span className="cn-target-badge" title={t.targetOf(mark.clue)} aria-label={t.targetOf(mark.clue)}>
          {TARGET_MARKS[mark.outcome].icon}
        </span>
      )}
      <div className="cn-card-inner">
        <div className="cn-face cn-face-front">
          <Fingerprint
            className="cn-card-agent size-[34%]"
            strokeWidth={1.3}
            aria-hidden="true"
          />
          <span className="cn-mirror" aria-hidden="true">
            {card.word}
          </span>
          {godMode && !card.revealed && (
            <span
              className="cn-god"
              style={{ "--god": style.tone } as React.CSSProperties}
              aria-hidden="true"
            >
              <span className="cn-god-tag">
                <Icon className="size-[45%]" strokeWidth={3} />
              </span>
            </span>
          )}
          <div className="cn-word-band">
            <span className="cn-word">{card.word}</span>
          </div>
        </div>

        <div className={cn("cn-face cn-face-back", style.back)}>
          <span className="cn-back-icon" aria-hidden="true">
            <Icon className="size-[58%]" strokeWidth={1.4} />
          </span>
          <span className="cn-back-word">{card.word}</span>
        </div>
      </div>

      {burst && (
        <>
          <span
            className="cn-ring"
            style={
              {
                "--burst": style.tone,
                animationDelay: "320ms",
                animationFillMode: "both",
              } as React.CSSProperties
            }
            aria-hidden="true"
          />
          {burst.map((piece, pieceIndex) => (
            <span
              key={pieceIndex}
              className="cn-burst"
              aria-hidden="true"
              style={
                {
                  "--burst": style.tone,
                  "--dx": piece.dx,
                  "--dy": piece.dy,
                  "--rot": piece.rot,
                  width: piece.size,
                  height: piece.size,
                  animationDelay: "300ms",
                  animationFillMode: "both",
                } as React.CSSProperties
              }
            />
          ))}
        </>
      )}
    </div>
  );
}

function markFor(card: BoardCard, focus: BoardFocus | null | undefined) {
  if (!focus) return undefined;
  const target = focus.targets.find((entry) => entry.word === card.word);
  return target ? { outcome: target.outcome, team: focus.team, clue: focus.clue } : undefined;
}

export function Board({
  cards,
  godMode,
  highlightWord,
  onPick,
  focus,
}: {
  cards: BoardCard[];
  godMode: boolean;
  highlightWord: string | null;
  onPick?: (card: BoardCard) => void;
  /** A clue whose targets are marked, dimming the other cards. */
  focus?: BoardFocus | null;
}) {
  const rows = Array.from({ length: 5 }, (_, row) =>
    cards.slice(row * 5, row * 5 + 5),
  );
  const t = useStrings(STRINGS);
  const [shake, setShake] = useState(false);
  const [flashKey, setFlashKey] = useState(0);
  const [mounted, setMounted] = useState(false);
  const revealedRef = useRef<Set<number> | null>(null);
  const timersRef = useRef<number[]>([]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const current = new Set(
      cards.filter((card) => card.revealed).map((card) => card.id),
    );
    const previous = revealedRef.current;
    revealedRef.current = current;
    if (!previous) return;
    const newlyAssassin = cards.some(
      (card) =>
        card.color === "assassin" && card.revealed && !previous.has(card.id),
    );
    if (!newlyAssassin) return;
    timersRef.current.push(
      window.setTimeout(() => {
        setShake(true);
        setFlashKey((value) => value + 1);
      }, 380),
      window.setTimeout(() => setShake(false), 1000),
    );
  }, [cards]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);

  return (
    <div
      role="grid"
      aria-label={t.board}
      className={cn(
        focus && "has-focus",
        "cn-board mx-auto grid w-full max-w-[900px] grid-cols-5 gap-1.5 p-2 sm:gap-2.5 sm:p-3.5 lg:max-w-[min(880px,calc((100dvh-220px)*1.43))]",
        shake && "animate-shake",
      )}
    >
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} role="row" className="contents">
          {row.map((card, cardIndex) => (
            <Card
              key={card.id}
              card={card}
              index={rowIndex * 5 + cardIndex}
              godMode={godMode}
              highlight={highlightWord !== null && card.word === highlightWord}
              onPick={onPick}
              mark={markFor(card, focus)}
            />
          ))}
        </div>
      ))}
      {mounted &&
        flashKey > 0 &&
        createPortal(
          <div key={flashKey} className="cn-flash" aria-hidden="true" />,
          document.body,
        )}
    </div>
  );
}
