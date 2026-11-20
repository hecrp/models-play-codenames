import { apply, BOARD_SIZE, createGame, normalizeWord } from "./engine";
import { createRng, hashSeed, randomInt, shuffle } from "./prng";
import { operativeSeat, otherTeam, spymasterSeat, teamOfSeat } from "./seats";
import { buildPublicHistory, viewFor } from "./view";
import { ES_WORDS } from "./words/es";
import type {
  AgentView,
  EngineEvent,
  GameAction,
  GameState,
  Seat,
  Team,
} from "./types";

export type AgentPolicy = (
  seat: Seat,
  view: AgentView,
  state: GameState,
) => GameAction;

function hiddenWords(view: AgentView): string[] {
  return view.board.filter((card) => !card.revealed).map((card) => card.word);
}

function findSafeClue(view: AgentView, rng: () => number): string {
  const hidden = hiddenWords(view).map(normalizeWord);
  const candidates = shuffle(ES_WORDS, rng);
  for (const candidate of candidates) {
    const normalized = normalizeWord(candidate);
    const conflicts = hidden.some(
      (word) =>
        word === normalized ||
        word.includes(normalized) ||
        normalized.includes(word),
    );
    if (!conflicts) return candidate;
  }
  throw new Error("No se encontró una pista segura para el agente falso.");
}

function pickHidden(
  view: AgentView,
  predicate: (color: string | null) => boolean,
  rng: () => number,
): string | null {
  const candidates = view.board
    .filter((card) => !card.revealed && predicate(card.color))
    .map((card) => card.word);
  if (candidates.length === 0) return null;
  return candidates[randomInt(rng, candidates.length)];
}

/** Test-only: picks a card by its true color, bypassing the operative view. */
function pickHiddenByColor(
  state: GameState,
  color: string,
  rng: () => number,
): string | null {
  const candidates = state.board
    .filter((card) => !card.revealed && card.color === color)
    .map((card) => card.word);
  if (candidates.length === 0) return null;
  return candidates[randomInt(rng, candidates.length)];
}

export function makeRandomPolicy(seed: number): AgentPolicy {
  const rng = createRng(hashSeed(seed) ^ 0xa5a5a5a5);
  return (seat, view) => {
    if (seat.endsWith("spymaster")) {
      return {
        type: "give_clue",
        word: findSafeClue(view, rng),
        number: randomInt(rng, 4),
        reasoning: "Pista aleatoria para la simulación.",
      };
    }

    if (view.turn.guessesMade > 0 && rng() < 0.18) {
      return { type: "stop", reasoning: "Me planto en la simulación." };
    }

    const word = pickHidden(view, () => true, rng);
    if (!word) {
      return { type: "stop", reasoning: "No quedan cartas." };
    }
    return { type: "guess", word, reasoning: "Carta aleatoria." };
  };
}

function colorPolicy(
  target: "own" | "opponent" | "neutral" | "assassin",
  stopAfterOwn = false,
): AgentPolicy {
  return (seat, view, state) => {
    if (seat.endsWith("spymaster")) {
      const rng = createRng(hashSeed(view.board.length + view.turn.guessesLeft));
      return {
        type: "give_clue",
        word: findSafeClue(view, rng),
        number: 3,
        reasoning: `Pista guionizada (${target}).`,
      };
    }

    const team = teamOfSeat(seat);
    const wanted =
      target === "own"
        ? team
        : target === "opponent"
          ? otherTeam(team)
          : target;
    const word = pickHiddenByColor(
      state,
      wanted,
      createRng(hashSeed(view.board.length + view.turn.guessesMade)),
    );
    if (word && !(stopAfterOwn && target === "own" && view.turn.guessesMade > 0)) {
      return { type: "guess", word, reasoning: `Carta ${target}.` };
    }
    if (view.turn.guessesMade === 0) {
      const fallback = pickHidden(view, () => true, createRng(hashSeed(view.board.length)));
      if (fallback) return { type: "guess", word: fallback, reasoning: "Primer intento obligatorio." };
    }
    return { type: "stop", reasoning: "Me planto." };
  };
}

export const alwaysOwnPolicy: AgentPolicy = (seat, view, state) => {
  if (seat.endsWith("spymaster")) {
    const rng = createRng(hashSeed(view.board.length));
    return {
      type: "give_clue",
      word: findSafeClue(view, rng),
      number: 9,
      reasoning: "Pista para todas mis cartas.",
    };
  }
  const word = pickHiddenByColor(
    state,
    teamOfSeat(seat),
    createRng(hashSeed(view.turn.guessesMade + 1)),
  );
  return word
    ? { type: "guess", word }
    : { type: "stop", reasoning: "No quedan cartas propias." };
};

export const alwaysOpponentPolicy = colorPolicy("opponent");
export const alwaysNeutralPolicy = colorPolicy("neutral");
export const alwaysAssassinPolicy = colorPolicy("assassin");
/** Guesses the single card the rules force, then always stops. */
export const alwaysStopPolicy: AgentPolicy = (seat, view) => {
  if (seat.endsWith("spymaster")) {
    return {
      type: "give_clue",
      word: findSafeClue(view, createRng(hashSeed(view.board.length))),
      number: 1,
    };
  }
  if (view.turn.guessesMade === 0) {
    const word = pickHidden(view, () => true, createRng(hashSeed(view.board.length)));
    if (word) return { type: "guess", word, reasoning: "Primer intento obligatorio." };
  }
  return { type: "stop", reasoning: "Siempre me planto." };
};

export interface FakeGameOptions {
  seed: number;
  id?: string;
  policy: AgentPolicy;
  wordList?: readonly string[];
  maxSteps?: number;
}

export interface FakeGameResult {
  state: GameState;
  events: EngineEvent[];
  steps: number;
}

/** Plays a deterministic fake game. Any illegal fake action is a test bug. */
export function playFakeGame(options: FakeGameOptions): FakeGameResult {
  const created = createGame({
    id: options.id ?? `fake-${options.seed}`,
    seed: options.seed,
    wordList: options.wordList,
  });
  let state = created.state;
  const events: EngineEvent[] = [...created.events];
  const maxSteps = options.maxSteps ?? 600;
  let steps = 0;

  while (state.status === "in_progress" && steps < maxSteps) {
    const seat =
      state.turn.phase === "clue"
        ? spymasterSeat(state.turn.team)
        : operativeSeat(state.turn.team);
    const view = viewFor(seat, state, buildPublicHistory(events));
    const action = options.policy(seat, view, state);
    const result = apply(state, seat, action);
    if (!result.ok) {
      throw new Error(
        `Acción ilegal del agente falso (${result.code}): ${result.message}`,
      );
    }
    state = result.state;
    events.push(...result.events);
    steps += 1;
  }

  if (state.status === "in_progress") {
    throw new Error(`La partida falsa no terminó en ${maxSteps} pasos.`);
  }

  return { state, events, steps };
}

/** Small helper used by tests to assert the board has the expected shape. */
export function assertValidBoard(state: GameState): boolean {
  if (state.board.length !== BOARD_SIZE) return false;
  const words = new Set(state.board.map((card) => card.normalized));
  return words.size === BOARD_SIZE;
}
