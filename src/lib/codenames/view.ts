import { otherTeam, teamOfSeat } from "./seats";
import { gameText } from "./messages";
import type {
  AgentView,
  AgentViewRole,
  CardColor,
  ClueMemoryEntry,
  EngineEvent,
  GameState,
  StoredGameEvent,
  Team,
} from "./types";

/**
 * Public history, as the players hear it: what is said at the table. It never
 * includes hidden card colors (only revealed ones) nor any model reasoning.
 * The spymaster's table talk is left out too: in Codenames the spymaster says
 * only the clue word and number, so their line is an aside for the audience
 * that no model reads. Rejected moves are left out as well: their messages can
 * name a hidden card (a clue too close to one of the spymaster's own cards) or
 * quote the model's text. The seat that failed gets the reason privately as
 * feedback; a lost turn shows up as its "end of turn" line.
 */
export function buildPublicHistory(
  events: ReadonlyArray<EngineEvent | StoredGameEvent>,
  options: { botTeam?: Team } = {},
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
        lines.push(
          h.clue(text.team[teamOfSeat(event.seat)], "", event.data.word, event.data.number),
        );
        break;
      }
      case "guess_made": {
        if (options.botTeam && teamOfSeat(event.seat) === options.botTeam) {
          lines.push(h.botGuess(text.team[options.botTeam], event.data.word));
          break;
        }
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
 * A spymaster's private memory: their team's earlier clues, the targets they
 * declared for each one and what became of every target since (found by their
 * operative, still pending, or revealed by the rival's operative). Built from
 * the clue_given targets, which are private like reasoning, so it must only
 * ever reach that team's spymaster.
 */
export function buildClueMemory(
  events: ReadonlyArray<EngineEvent | StoredGameEvent>,
  team: Team,
): ClueMemoryEntry[] {
  const entries: ClueMemoryEntry[] = [];
  let turn = 1;
  for (const event of events) {
    if (event.type === "turn_started") {
      turn = event.data.turn;
    } else if (event.type === "clue_given" && teamOfSeat(event.seat) === team) {
      entries.push({
        turn,
        word: event.data.word,
        number: event.data.number,
        ...(Array.isArray(event.data.targets)
          ? { targets: event.data.targets.map((word) => ({ word, status: "pending" as const })) }
          : {}),
      });
    } else if (event.type === "guess_made") {
      const status = teamOfSeat(event.seat) === team ? "found" : "rival";
      for (const entry of entries) {
        for (const target of entry.targets ?? []) {
          if (target.status === "pending" && target.word === event.data.word) target.status = status;
        }
      }
    }
  }
  return entries;
}

/**
 * The ONLY way agents receive game information. Hidden colors are removed for
 * operatives; spymasters get the color lists and their own clue memory (from
 * `events`); spectators see everything public.
 */
export function viewFor(
  role: AgentViewRole,
  state: GameState,
  history: string[] = [],
  events: ReadonlyArray<EngineEvent | StoredGameEvent> = [],
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
      // Players get the clue alone: the spymaster's aside and reasoning stay out.
      clue: state.turn.clue
        ? isSpectator
          ? { ...state.turn.clue }
          : { word: state.turn.clue.word, number: state.turn.clue.number }
        : null,
    },
    history: [...history],
    clueMemory: isSpymaster && team ? buildClueMemory(events, team) : null,
  };
}

export type { CardColor };
