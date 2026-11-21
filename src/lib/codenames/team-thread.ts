import { teamOfSeat } from "./seats";
import type { GuessResult, Seat, StoredGameEvent, Team } from "./types";

export type Forfeit = "clue_failed" | "attempts_exhausted";

/**
 * What became of a card the spymaster aimed a clue at: found on that same
 * turn, found by the team on a later turn, revealed by the rival, or not
 * found yet (in the events seen so far).
 */
export type TargetOutcome = "hit" | "later" | "rival" | "pending";

export interface ClueTarget {
  word: string;
  outcome: TargetOutcome;
  /** Turn the card was revealed, when it was. */
  turn?: number;
}

/** What a model thought before a move, when the game kept it. */
export interface ThreadThought {
  /** The model's own reasoning (reasoning tokens), when the provider returns it. */
  text?: string;
  /** The short `reasoning` argument the model wrote in the tool call. */
  note?: string;
  modelId?: string;
  effort?: string;
  reasoningTokens?: number;
  latencyMs?: number;
}

/** Fields shared by every message one seat sends. */
interface MessageBase {
  id: string;
  seat: Seat;
  turn: number;
  say?: string;
  thought?: ThreadThought;
}

export type ThreadItem =
  | { kind: "turn"; id: string; turn: number }
  | (MessageBase & {
      kind: "clue";
      word: string;
      number: number;
      /** The cards the clue aimed at and their fate; absent when not declared or redacted. */
      targets?: ClueTarget[];
    })
  | (MessageBase & { kind: "guess"; word: string; result: GuessResult })
  | (MessageBase & { kind: "stop" })
  | { kind: "forfeit"; id: string; reason: Forfeit }
  | { kind: "rejected"; id: string; seat: Seat; message: string; transient: boolean };

/**
 * The reasoning behind a move. The orchestrator attaches a call's metadata to
 * the first event that call produced, so it sits on the clue, the guess or the
 * stop itself. Redacted events (a human operative's view) carry none.
 */
function thoughtOf(event: StoredGameEvent): ThreadThought | undefined {
  const text = event.meta?.reasoning?.trim();
  const note =
    "data" in event && "reasoning" in event.data && typeof event.data.reasoning === "string"
      ? event.data.reasoning.trim()
      : undefined;
  if (!text && !note) return undefined;
  return {
    ...(text ? { text } : {}),
    ...(note ? { note } : {}),
    ...(event.meta?.modelId ? { modelId: event.meta.modelId } : {}),
    ...(event.meta?.reasoningEffort ? { effort: event.meta.reasoningEffort } : {}),
    ...(event.meta?.reasoningTokens ? { reasoningTokens: event.meta.reasoningTokens } : {}),
    ...(event.meta?.latencyMs ? { latencyMs: event.meta.latencyMs } : {}),
  };
}

/** Same normalization as the engine, kept local so the client bundle stays light. */
function normalize(word: string): string {
  return word.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Which team revealed each card, and on which turn. */
function revealsByWord(events: StoredGameEvent[]): Map<string, { team: Team; turn: number }> {
  const reveals = new Map<string, { team: Team; turn: number }>();
  let turn = 0;
  for (const event of events) {
    if (event.type === "turn_started") turn = event.data.turn;
    if (event.type === "guess_made") {
      const key = normalize(event.data.word);
      if (!reveals.has(key)) reveals.set(key, { team: teamOfSeat(event.seat), turn });
    }
  }
  return reveals;
}

function targetOf(
  word: string,
  team: Team,
  clueTurn: number,
  reveals: Map<string, { team: Team; turn: number }>,
): ClueTarget {
  const reveal = reveals.get(normalize(word));
  if (!reveal) return { word, outcome: "pending" };
  const outcome: TargetOutcome =
    reveal.team !== team ? "rival" : reveal.turn === clueTurn ? "hit" : "later";
  return { word, outcome, turn: reveal.turn };
}

/**
 * One team's conversation: the spymaster's clues and the operative's guesses,
 * grouped by turn like a chat between the two seats.
 */
export function buildTeamThread(events: StoredGameEvent[], team: Team): ThreadItem[] {
  const reveals = revealsByWord(events);
  const items: ThreadItem[] = [];
  let turn = 0;
  for (const event of events) {
    const id = String(event.id);
    switch (event.type) {
      case "turn_started":
        turn = event.data.turn;
        if (event.data.team === team) items.push({ kind: "turn", id, turn });
        break;
      case "clue_given":
        if (teamOfSeat(event.seat) === team) {
          items.push({
            kind: "clue",
            id,
            seat: event.seat,
            turn,
            word: event.data.word,
            number: event.data.number,
            say: event.data.say,
            thought: thoughtOf(event),
            ...(event.data.targets
              ? { targets: event.data.targets.map((word) => targetOf(word, team, turn, reveals)) }
              : {}),
          });
        }
        break;
      case "guess_made":
        if (teamOfSeat(event.seat) === team) {
          items.push({
            kind: "guess",
            id,
            seat: event.seat,
            turn,
            word: event.data.word,
            result: event.data.result,
            say: event.data.say,
            thought: thoughtOf(event),
          });
        }
        break;
      case "turn_ended":
        if (!event.seat || teamOfSeat(event.seat) !== team) break;
        if (event.data.reason === "stopped") {
          items.push({
            kind: "stop",
            id,
            seat: event.seat,
            turn,
            say: event.data.say,
            thought: thoughtOf(event),
          });
        } else if (
          event.data.reason === "clue_failed" ||
          event.data.reason === "attempts_exhausted"
        ) {
          items.push({ kind: "forfeit", id, reason: event.data.reason });
        }
        break;
      case "agent_error":
        if (teamOfSeat(event.seat) === team) {
          items.push({
            kind: "rejected",
            id,
            seat: event.seat,
            message: event.data.message,
            transient: event.data.transient === true,
          });
        }
        break;
      default:
        break;
    }
  }
  return items;
}
