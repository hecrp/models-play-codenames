import { apply, createGame, validateClue } from "../../src/lib/codenames/engine";
import { ES_WORDS } from "../../src/lib/codenames/words/es";
import type {
  ApplyResult,
  CardColor,
  GameAction,
  GameState,
  Seat,
} from "../../src/lib/codenames/types";

export function newGame(seed = 42, id = `test-${seed}`): GameState {
  return createGame({ id, seed, createdAt: 1_700_000_000_000 }).state;
}

export function safeClue(state: GameState, number = 2): string {
  for (const word of ES_WORDS) {
    if (!validateClue(state, word, number)) return word;
  }
  throw new Error("No se encontró una pista válida.");
}

export function cardOfColor(state: GameState, color: CardColor) {
  const card = state.board.find(
    (candidate) => !candidate.revealed && candidate.color === color,
  );
  if (!card) throw new Error(`No queda ninguna carta de color ${color}`);
  return card;
}

export function ok(result: ApplyResult): Extract<ApplyResult, { ok: true }> {
  if (!result.ok) {
    throw new Error(`Acción rechazada (${result.code}): ${result.message}`);
  }
  return result;
}

export function playAction(
  state: GameState,
  seat: Seat,
  action: GameAction,
): GameState {
  return ok(apply(state, seat, action)).state;
}

export function turnEnds(state: GameState, number = 2): GameState {
  const clue = safeClue(state, number);
  const spymaster = `${state.turn.team}_spymaster` as Seat;
  return playAction(state, spymaster, {
    type: "give_clue",
    word: clue,
    number,
  });
}
