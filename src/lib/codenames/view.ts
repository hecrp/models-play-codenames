import { otherTeam, teamOfSeat } from "./seats";
import { gameText } from "./messages";
import type {
  AgentView,
  AgentViewRole,
  CardColor,
  EngineEvent,
  GameState,
  StoredGameEvent,
} from "./types";

/**
 * Public history: everything a spectator can see. It never includes hidden
 * card colors (only revealed ones) nor any model reasoning.
 */
export function buildPublicHistory(
  events: ReadonlyArray<EngineEvent | StoredGameEvent>,
): string[] {
  const started = events.find((event) => event.type === "game_started");
  const text = gameText(started?.type === "game_started" ? started.data.lang : "es");
  const h = text.history;
  const lines: string[] = [];

  for (const event of events) {
    switch (event.type) {
      case "game_started":
        lines.push(h.started(text.team[event.data.startingTeam]));
        break;
      case "turn_started":
        lines.push(h.turn(event.data.turn, text.team[event.data.team]));
        break;
      case "clue_given": {
        const quote = event.data.say ? ` «${event.data.say}»` : "";
        lines.push(
          h.clue(text.team[teamOfSeat(event.seat)], quote, event.data.word, event.data.number),
        );
        break;
      }
      case "guess_made": {
        const quote = event.data.say ? ` «${event.data.say}»` : "";
        lines.push(
          h.guess(
            text.team[teamOfSeat(event.seat)],
            quote,
            event.data.word,
            h.result[event.data.result],
          ),
        );
        break;
      }
      case "turn_ended": {
        lines.push(h.turnEnd(h.endReasons[event.data.reason] ?? event.data.reason));
        if (event.data.say) lines.push(h.says(event.data.say));
        break;
      }
      case "agent_error":
        lines.push(h.seatError(event.seat, event.data.code, event.data.message));
        break;
      case "game_over":
        lines.push(
          event.data.winner === "draw"
            ? h.draw
            : event.data.winner
              ? h.winner(text.team[event.data.winner], event.data.reason)
              : h.noWinner(event.data.reason),
        );
        break;
      case "thinking":
      case "game_paused":
      case "game_resumed":
      case "control_changed":
        break;
    }
  }

  return lines;
}

/**
 * The ONLY way agents receive game information. Hidden colors are removed for
 * operatives; spymasters get the color lists; spectators see everything.
 */
export function viewFor(
  role: AgentViewRole,
  state: GameState,
  history: string[] = [],
): AgentView {
  const isSpectator = role === "spectator";
  const team = isSpectator ? null : teamOfSeat(role);
  const isSpymaster = role !== "spectator" && role.endsWith("spymaster");
  const board = state.board.map((card) => ({
    id: card.id,
    word: card.word,
    color:
      isSpectator || isSpymaster
        ? card.color
        : card.revealed
          ? card.color
          : null,
    revealed: card.revealed,
  }));

  const revealed = state.board
    .filter((card) => card.revealed)
    .map((card) => ({ word: card.word, color: card.color }));

  let ownWords: string[] | null = null;
  let opponentWords: string[] | null = null;
  let neutralWords: string[] | null = null;
  let assassinWord: string | null = null;

  if (isSpymaster && team) {
    const hidden = state.board.filter((card) => !card.revealed);
    ownWords = hidden
      .filter((card) => card.color === team)
      .map((card) => card.word);
    opponentWords = hidden
      .filter((card) => card.color === otherTeam(team))
      .map((card) => card.word);
    neutralWords = hidden
      .filter((card) => card.color === "neutral")
      .map((card) => card.word);
    assassinWord = hidden.find((card) => card.color === "assassin")?.word ?? null;
  }

  return {
    role,
    lang: state.lang,
    team,
    board,
    ownWords,
    opponentWords,
    neutralWords,
    assassinWord,
    remaining: {
      red: state.board.filter((card) => card.color === "red" && !card.revealed).length,
      blue: state.board.filter((card) => card.color === "blue" && !card.revealed).length,
    },
    revealed,
    turn: {
      ...state.turn,
      clue: state.turn.clue ? { ...state.turn.clue } : null,
    },
    history: [...history],
  };
}

export type { CardColor };
