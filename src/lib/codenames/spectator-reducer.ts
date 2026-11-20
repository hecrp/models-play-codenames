import { guessesForClue } from "./rules";
import type { GameState, StoredGameEvent } from "./types";

/**
 * Apply one stored event to a spectator state. Used by the live SSE client.
 * The event log is the source of truth; this reducer only keeps the view in
 * sync without re-running the engine.
 */
export function applySpectatorEvent(
  state: GameState,
  event: StoredGameEvent,
): GameState {
  switch (event.type) {
    case "game_started":
      return {
        ...state,
        seed: event.data.seed,
        lang: event.data.lang,
        startingTeam: event.data.startingTeam,
        board: event.data.board.map((card) => ({
          id: card.id,
          word: card.word,
          normalized: card.word
            .trim()
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, ""),
          color: card.color,
          revealed: false,
        })),
      };
    case "turn_started":
      return {
        ...state,
        turnsPlayed: event.data.turn,
        turn: {
          team: event.data.team,
          phase: event.data.phase,
          clue: null,
          guessesLeft: 0,
          guessesMade: 0,
        },
        ...(state.status === "paused" ? { status: "in_progress" as const } : {}),
      };
    case "clue_given":
      return {
        ...state,
        turn: {
          ...state.turn,
          phase: "guess",
          clue: {
            word: event.data.word,
            number: event.data.number,
            ...(event.data.reasoning
              ? { reasoning: event.data.reasoning }
              : {}),
            ...(event.data.say ? { say: event.data.say } : {}),
          },
          guessesLeft: guessesForClue(event.data.number),
          guessesMade: 0,
        },
      };
    case "guess_made": {
      const board = state.board.map((card) => {
        if (
          card.normalized !==
          event.data.word
            .trim()
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
        ) {
          return card;
        }
        return { ...card, revealed: true, color: event.data.color };
      });
      return {
        ...state,
        board,
        turn: {
          ...state.turn,
          guessesLeft: event.data.guessesLeft,
          guessesMade: event.data.guessesMade,
        },
      };
    }
    case "turn_ended":
      return {
        ...state,
        turn: {
          team: event.data.nextTeam ?? state.turn.team,
          phase: "clue",
          clue: null,
          guessesLeft: 0,
          guessesMade: 0,
        },
      };
    case "game_over":
      return {
        ...state,
        winner: event.data.winner,
        winReason: event.data.reason,
        turnsPlayed: event.data.turnsPlayed,
        status:
          event.data.reason === "all_cards" ||
          event.data.reason === "assassin" ||
          event.data.reason === "turn_limit"
            ? "finished"
            : "aborted",
      };
    case "game_paused":
      return { ...state, status: "paused" };
    case "game_resumed":
      return { ...state, status: "in_progress" };
    case "thinking":
    case "agent_error":
    case "control_changed":
      return state;
  }
}
