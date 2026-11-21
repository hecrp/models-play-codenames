import { guessesForClue } from "./rules";
import type {
  BoardCard,
  EngineEvent,
  GameState,
  Seat,
  StoredGameEvent,
} from "./types";

/**
 * Rebuild the spectator state from the persisted event log. This is used by
 * replay and as a recovery fallback; the live game also keeps a snapshot.
 */
export function replayEvents(
  events: ReadonlyArray<EngineEvent | StoredGameEvent>,
): GameState {
  const started = events.find((event) => event.type === "game_started");
  if (!started || started.type !== "game_started") {
    throw new Error("El log no contiene un evento game_started.");
  }

  const at = "at" in started && typeof started.at === "number" ? started.at : 0;
  const board: BoardCard[] = started.data.board.map((card) => ({
    id: card.id,
    word: card.word,
    normalized: card.word
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, ""),
    color: card.color,
    revealed: false,
  }));

  const state: GameState = {
    id: "replay",
    seed: started.data.seed,
    lang: started.data.lang,
    startingTeam: started.data.startingTeam,
    board,
    turn: {
      team: started.data.startingTeam,
      phase: "clue",
      clue: null,
      guessesLeft: 0,
      guessesMade: 0,
    },
    status: "in_progress",
    winner: null,
    winReason: null,
    turnsPlayed: 1,
    createdAt: at,
  };

  const startedIndex = events.indexOf(started);
  for (const event of events.slice(startedIndex + 1)) {
    switch (event.type) {
      case "turn_started":
        state.turnsPlayed = event.data.turn;
        state.turn = {
          team: event.data.team,
          phase: event.data.phase,
          clue: null,
          guessesLeft: 0,
          guessesMade: 0,
        };
        if (state.status === "paused") state.status = "in_progress";
        break;
      case "clue_given":
        state.turn = {
          ...state.turn,
          phase: "guess",
          clue: {
            word: event.data.word,
            number: event.data.number,
            ...(event.data.reasoning ? { reasoning: event.data.reasoning } : {}),
            ...(event.data.say ? { say: event.data.say } : {}),
          },
          guessesLeft: guessesForClue(event.data.number),
          guessesMade: 0,
        };
        break;
      case "guess_made": {
        const card = state.board.find(
          (candidate) =>
            candidate.normalized ===
            event.data.word
              .trim()
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, ""),
        );
        if (card) {
          card.revealed = true;
          card.color = event.data.color;
        }
        state.turn = {
          ...state.turn,
          guessesLeft: event.data.guessesLeft,
          guessesMade: event.data.guessesMade,
        };
        break;
      }
      case "turn_ended":
        state.turn = {
          team: event.data.nextTeam ?? state.turn.team,
          phase: "clue",
          clue: null,
          guessesLeft: 0,
          guessesMade: 0,
        };
        break;
      case "game_over":
        state.winner = event.data.winner;
        state.winReason = event.data.reason;
        state.turnsPlayed = event.data.turnsPlayed;
        state.status =
          event.data.reason === "all_cards" ||
          event.data.reason === "assassin" ||
          event.data.reason === "turn_limit"
            ? "finished"
            : "aborted";
        break;
      case "game_paused":
        state.status = "paused";
        break;
      case "game_resumed":
        state.status = "in_progress";
        break;
      case "thinking":
      case "agent_error":
      case "control_changed":
        break;
    }
  }

  return state;
}

/**
 * How long a replay lingers after showing `event`, so watching one feels like
 * the live game: a pause while the next model "thinks", time to read table
 * talk (as the live orchestrator gives), and quick steps for bookkeeping.
 * `next` is the event about to be shown, used to pace the thinking pause.
 */
export function replayDelay(
  event: StoredGameEvent,
  next: StoredGameEvent | undefined,
  speed = 1,
): number {
  let ms: number;
  switch (event.type) {
    case "thinking":
      // The real latency of the coming move, clamped to keep the pace lively.
      ms =
        event.data.state === "start"
          ? Math.min(2600, Math.max(900, next?.meta?.latencyMs ?? 1400))
          : 120;
      break;
    case "clue_given":
    case "guess_made":
    case "turn_ended": {
      const say = "say" in event.data ? event.data.say : undefined;
      ms = say ? 700 + Math.min(1800, 400 + say.length * 12) : 650;
      break;
    }
    case "turn_started":
      ms = 500;
      break;
    case "agent_error":
      ms = 1100;
      break;
    default:
      ms = 300;
  }
  return Math.round(ms / speed);
}

/** The seat still thinking at the end of `events`, if any. */
export function pendingThinker(events: ReadonlyArray<StoredGameEvent>): Seat | null {
  const last = events[events.length - 1];
  return last?.type === "thinking" && last.data.state === "start" ? last.seat : null;
}
