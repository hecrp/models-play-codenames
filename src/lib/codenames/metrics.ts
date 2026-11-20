import type { StoredGameEvent } from "./types";

export interface GameMetrics {
  costUsd: number;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  events: number;
  illegalAttempts: number;
  stops: number;
  clues: number;
  guesses: number;
  ownGuesses: number;
  opponentGuesses: number;
  neutralGuesses: number;
  assassinGuesses: number;
  averageClueNumber: number;
  averageCorrectGuesses: number;
}

export const EMPTY_METRICS: GameMetrics = {
  costUsd: 0,
  latencyMs: 0,
  promptTokens: 0,
  completionTokens: 0,
  events: 0,
  illegalAttempts: 0,
  stops: 0,
  clues: 0,
  guesses: 0,
  ownGuesses: 0,
  opponentGuesses: 0,
  neutralGuesses: 0,
  assassinGuesses: 0,
  averageClueNumber: 0,
  averageCorrectGuesses: 0,
};

export function computeMetrics(
  events: ReadonlyArray<StoredGameEvent>,
): GameMetrics {
  const metrics: GameMetrics = { ...EMPTY_METRICS, events: events.length };
  let clueNumberTotal = 0;

  for (const event of events) {
    if (event.meta) {
      metrics.costUsd += event.meta.costUsd ?? 0;
      metrics.latencyMs += event.meta.latencyMs ?? 0;
      metrics.promptTokens += event.meta.promptTokens ?? 0;
      metrics.completionTokens += event.meta.completionTokens ?? 0;
    }

    if (event.type === "agent_error") {
      metrics.illegalAttempts += 1;
    } else if (event.type === "clue_given") {
      metrics.clues += 1;
      clueNumberTotal += event.data.number;
    } else if (event.type === "guess_made") {
      metrics.guesses += 1;
      if (event.data.result === "own") metrics.ownGuesses += 1;
      else if (event.data.result === "opponent") metrics.opponentGuesses += 1;
      else if (event.data.result === "neutral") metrics.neutralGuesses += 1;
      else if (event.data.result === "assassin") metrics.assassinGuesses += 1;
    } else if (
      event.type === "turn_ended" &&
      event.data.reason === "stopped"
    ) {
      metrics.stops += 1;
    }
  }

  metrics.averageClueNumber = metrics.clues
    ? clueNumberTotal / metrics.clues
    : 0;
  metrics.averageCorrectGuesses = metrics.clues
    ? metrics.ownGuesses / metrics.clues
    : 0;
  return metrics;
}
