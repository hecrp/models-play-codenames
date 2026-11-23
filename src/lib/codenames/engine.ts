import { ES_WORDS } from "./words/es";
import { EN_WORDS } from "./words/en";
import { gameText } from "./messages";
import { createRng, hashSeed, shuffle } from "./prng";
import { guessesForClue } from "./rules";
import { operativeSeat, otherTeam, roleOfSeat, teamOfSeat } from "./seats";
import type {
  ApplyError,
  ApplyResult,
  BoardCard,
  CardColor,
  EngineEvent,
  GameAction,
  GameOverReason,
  GameState,
  GuessResult,
  Language,
  Seat,
  Team,
  TurnEndReason,
} from "./types";

export const BOARD_SIZE = 25;
export const MAX_TURNS = 40;
export const MAX_ATTEMPTS = 3;
export const CLUE_MIN = 0;
export const CLUE_MAX = 9;
export { guessesForClue, UNLIMITED_GUESSES } from "./rules";

const STARTING_TEAM_CARDS = 9;
const SECOND_TEAM_CARDS = 8;
const NEUTRAL_CARDS = 7;
const ASSASSIN_CARDS = 1;

/**
 * Lowercase, trim and remove diacritics (including ñ) so models and board
 * words compare consistently.
 */
/**
 * Cyrillic and Greek letters (lowercased) that look like Latin ones. Models
 * sometimes write a board word with one of them («GALLETА» with a Cyrillic А):
 * folded, the word still matches its card, and a clue cannot sneak in a board
 * word that way either.
 */
const LOOKALIKES: Record<string, string> = {
  а: "a", в: "b", е: "e", к: "k", м: "m", н: "h", о: "o", р: "p", с: "c", т: "t",
  у: "y", х: "x", і: "i", ј: "j", ѕ: "s", ԁ: "d", һ: "h",
  α: "a", β: "b", ε: "e", ζ: "z", η: "h", ι: "i", κ: "k", μ: "m", ν: "n", ο: "o",
  ρ: "p", τ: "t", υ: "y", χ: "x",
};
const LOOKALIKE_PATTERN = new RegExp(`[${Object.keys(LOOKALIKES).join("")}]`, "g");

export function normalizeWord(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(LOOKALIKE_PATTERN, (letter) => LOOKALIKES[letter])
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function isSingleWord(value: string): boolean {
  const word = value.trim();
  if (!word) return false;
  if (/\s/.test(word)) return false;
  if (word.includes("-")) return false;
  return /^[\p{L}]+$/u.test(word);
}

export function remainingCards(state: GameState): Record<Team, number> {
  return {
    red: state.board.filter((card) => card.color === "red" && !card.revealed)
      .length,
    blue: state.board.filter((card) => card.color === "blue" && !card.revealed)
      .length,
  };
}

function fail(code: ApplyError["code"], message: string): ApplyError {
  return { ok: false, code, message };
}

/**
 * Table talk is public: strip any hidden board word (except the one the seat is
 * allowed to name) so a model cannot leak private information by chatting.
 * `masked` counts the words removed, which the study uses as leak attempts.
 */
export function cleanSay(
  raw: string | undefined,
  state: GameState,
  allowedWord?: string,
): { say?: string; masked: number } {
  if (!raw) return { masked: 0 };
  const clean = raw.replace(/\s+/g, " ").trim().slice(0, 180);
  if (!clean) return { masked: 0 };
  const allowed = allowedWord ? normalizeWord(allowedWord) : null;
  const hidden = new Set(
    state.board
      .filter((card) => !card.revealed && card.normalized !== allowed)
      .map((card) => card.normalized),
  );
  let masked = 0;
  const filtered = clean
    .split(" ")
    .map((token) => {
      const bare = normalizeWord(token.replace(/[^\p{L}\p{N}]/gu, ""));
      if (bare && hidden.has(bare)) {
        masked += 1;
        return "…";
      }
      return token;
    })
    .join(" ")
    .replace(/(?:\s*…\s*)+/g, " … ")
    .trim();
  return { say: filtered || undefined, masked };
}

/** Spread helper for the optional `say` / `sayMasked` event fields. */
function sayFields(talk: { say?: string; masked: number }) {
  return {
    ...(talk.say ? { say: talk.say } : {}),
    ...(talk.masked > 0 ? { sayMasked: talk.masked } : {}),
  };
}

/**
 * Map the spymaster's declared targets to unrevealed board words. Unknown
 * words are dropped (and counted); duplicates are removed.
 */
function resolveTargets(
  state: GameState,
  raw: string[] | undefined,
): { targets?: string[]; dropped: number } {
  if (!raw) return { dropped: 0 };
  const targets: string[] = [];
  let dropped = 0;
  for (const value of raw) {
    const normalized = normalizeWord(String(value));
    const card = state.board.find(
      (candidate) => !candidate.revealed && candidate.normalized === normalized,
    );
    if (!card) dropped += 1;
    else if (!targets.includes(card.word)) targets.push(card.word);
  }
  return { targets, dropped };
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    board: state.board.map((card) => ({ ...card })),
    turn: {
      ...state.turn,
      clue: state.turn.clue ? { ...state.turn.clue } : null,
    },
  };
}

/** Rough singular form (Spanish and English) so plurals count as "the same word". */
function singular(word: string): string {
  if (word.length > 4 && word.endsWith("ces")) return `${word.slice(0, -3)}z`;
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && /[^aeiou]es$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s")) return word.slice(0, -1);
  return word;
}

/** Shortest fragment that can count as the same root inside a longer word. */
const MIN_EMBEDDED_ROOT = 4;
/** Shortest leftover that can be the other half of a compound word. */
const MIN_COMPOUND_PART = 3;
/** Short endings that turn a word into a derived one (FARM → FARMER). */
const DERIVATION_ENDINGS = new Set(["er", "or"]);
/** Shortest shared beginning that marks two words as the same family. */
const MIN_SHARED_PREFIX = 5;

function commonPrefixLength(a: string, b: string): number {
  let length = 0;
  while (length < a.length && length < b.length && a[length] === b[length]) {
    length += 1;
  }
  return length;
}

/**
 * Whether a clue counts as "a form of" a board word: the same word, its plural,
 * a compound that embeds it (AGUA / PARAGUAS) or the same word family
 * (MARINERO / MARINA). A short fragment that merely appears inside an
 * unrelated word (CAN in CANDADO, PIE in PIEL) does not count.
 * Both arguments must already be normalized.
 */
export function sharesRoot(clue: string, boardWord: string): boolean {
  if (clue === boardWord) return true;
  const a = singular(clue);
  const b = singular(boardWord);
  if (a === b) return true;

  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length >= MIN_EMBEDDED_ROOT && short.length * 2 >= long.length) {
    // Only at either end, and the rest must look like another word or a
    // derivation: CHAIR is not HAIR, but LIGHTHOUSE contains HOUSE.
    if (long.startsWith(short)) {
      const rest = long.slice(short.length);
      if (rest.length >= MIN_COMPOUND_PART || DERIVATION_ENDINGS.has(rest)) return true;
    }
    if (long.endsWith(short) && long.length - short.length >= MIN_COMPOUND_PART) {
      return true;
    }
  }

  const prefix = commonPrefixLength(a, b);
  return prefix >= MIN_SHARED_PREFIX && prefix * 4 >= short.length * 3;
}

export function validateClue(
  state: GameState,
  rawWord: string,
  number: number,
): ApplyError | null {
  const text = gameText(state.lang);
  const word = rawWord.trim();
  if (!isSingleWord(word)) {
    return fail("clue_not_single_word", text.clueNotSingleWord);
  }
  if (!Number.isInteger(number) || number < CLUE_MIN || number > CLUE_MAX) {
    return fail("number_out_of_range", text.numberRange(CLUE_MIN, CLUE_MAX));
  }

  const clue = normalizeWord(word);
  const hiddenCards = state.board.filter((card) => !card.revealed);
  for (const card of hiddenCards) {
    if (sharesRoot(clue, card.normalized)) {
      return fail("clue_on_board", text.clueOnBoard(word, card.word));
    }
  }
  return null;
}

export interface CreateGameOptions {
  id: string;
  seed: number;
  lang?: Language;
  wordList?: readonly string[];
  createdAt?: number;
}

export function createGame(options: CreateGameOptions): {
  state: GameState;
  events: EngineEvent[];
} {
  const wordList = options.wordList ?? (options.lang === "en" ? EN_WORDS : ES_WORDS);
  const unique = new Map<string, string>();
  for (const word of wordList) {
    const normalized = normalizeWord(word);
    if (normalized && !unique.has(normalized)) unique.set(normalized, word);
  }
  const pool = [...unique.values()];
  if (pool.length < BOARD_SIZE) {
    throw new Error(`The word list needs at least ${BOARD_SIZE} unique entries.`);
  }

  const rng = createRng(hashSeed(options.seed));
  const words = shuffle(pool, rng).slice(0, BOARD_SIZE);
  const startingTeam: Team = rng() < 0.5 ? "red" : "blue";
  const secondTeam = otherTeam(startingTeam);

  const colors: CardColor[] = [
    ...Array<CardColor>(STARTING_TEAM_CARDS).fill(startingTeam),
    ...Array<CardColor>(SECOND_TEAM_CARDS).fill(secondTeam),
    ...Array<CardColor>(NEUTRAL_CARDS).fill("neutral"),
    ...Array<CardColor>(ASSASSIN_CARDS).fill("assassin"),
  ];
  const shuffledColors = shuffle(colors, rng);

  const board: BoardCard[] = words.map((word, index) => ({
    id: index,
    word: word.toUpperCase(),
    normalized: normalizeWord(word),
    color: shuffledColors[index],
    revealed: false,
  }));

  const createdAt = options.createdAt ?? Date.now();
  const state: GameState = {
    id: options.id,
    seed: options.seed,
    lang: options.lang ?? "es",
    startingTeam,
    board,
    turn: {
      team: startingTeam,
      phase: "clue",
      clue: null,
      guessesLeft: 0,
      guessesMade: 0,
    },
    status: "in_progress",
    winner: null,
    winReason: null,
    turnsPlayed: 1,
    createdAt,
  };

  return {
    state,
    events: [
      {
        type: "game_started",
        data: {
          seed: state.seed,
          lang: state.lang,
          startingTeam,
          board: board.map((card) => ({
            id: card.id,
            word: card.word,
            color: card.color,
          })),
        },
      },
      {
        type: "turn_started",
        data: { turn: 1, team: startingTeam, phase: "clue" },
      },
    ],
  };
}

function finishGame(
  state: GameState,
  winner: GameState["winner"],
  reason: GameOverReason,
  events: EngineEvent[],
): void {
  state.status =
    reason === "all_cards" ||
    reason === "assassin" ||
    reason === "turn_limit"
      ? "finished"
      : "aborted";
  state.winner = winner;
  state.winReason = reason;
  events.push({
    type: "game_over",
    data: {
      winner,
      reason,
      remaining: remainingCards(state),
      turnsPlayed: state.turnsPlayed,
    },
  });
}

function finishByTurnLimit(state: GameState, events: EngineEvent[]): void {
  const remaining = remainingCards(state);
  const winner =
    remaining.red === remaining.blue
      ? "draw"
      : remaining.red < remaining.blue
        ? "red"
        : "blue";
  finishGame(state, winner, "turn_limit", events);
}

function endTurn(
  state: GameState,
  reason: TurnEndReason,
  events: EngineEvent[],
  seat?: Seat,
  reasoning?: string,
  talk: { say?: string; masked: number } = { masked: 0 },
): void {
  const currentTeam = state.turn.team;
  const next = otherTeam(currentTeam);
  const atLimit = state.turnsPlayed >= MAX_TURNS;
  const nextTeam = atLimit ? null : next;

  events.push({
    type: "turn_ended",
    ...(seat ? { seat } : {}),
    data: {
      reason,
      turn: state.turnsPlayed,
      nextTeam,
      remaining: remainingCards(state),
      ...(reasoning ? { reasoning } : {}),
      ...sayFields(talk),
    },
  });

  if (atLimit) {
    finishByTurnLimit(state, events);
    return;
  }

  state.turnsPlayed += 1;
  state.turn = {
    team: next,
    phase: "clue",
    clue: null,
    guessesLeft: 0,
    guessesMade: 0,
  };
  events.push({
    type: "turn_started",
    data: { turn: state.turnsPlayed, team: next, phase: "clue" },
  });
}

/**
 * The order in which the automaton reveals its cards: a fixed shuffle of its
 * own cards, from the board's seed and the team, so every model faces the same
 * automaton on the same board.
 */
export function botCardOrder(state: GameState, team: Team): string[] {
  const own = state.board.filter((card) => card.color === team).map((card) => card.word);
  return shuffle(own, createRng(hashSeed(state.seed * 31 + (team === "red" ? 1 : 2))));
}

/**
 * The automaton's turn (study bot mode): it reveals up to `pace` of its own
 * unrevealed cards in botCardOrder and ends the turn. No clue, no table talk.
 * It wins if that reveals its last card; the turn limit applies as usual.
 */
export function botTurn(state: GameState, pace: number): { state: GameState; events: EngineEvent[] } {
  if (state.status === "finished" || state.status === "aborted") {
    return { state: cloneState(state), events: [] };
  }
  const next = cloneState(state);
  const team = next.turn.team;
  const seat = operativeSeat(team);
  const events: EngineEvent[] = [];
  let made = 0;
  for (const word of botCardOrder(next, team)) {
    if (made >= pace) break;
    const card = next.board.find((candidate) => candidate.word === word);
    if (!card || card.revealed) continue;
    card.revealed = true;
    made += 1;
    events.push({
      type: "guess_made",
      seat,
      data: { word: card.word, color: card.color, result: "own", guessesLeft: Math.max(0, pace - made), guessesMade: made },
    });
    if (remainingCards(next)[team] === 0) {
      finishGame(next, team, "all_cards", events);
      return { state: next, events };
    }
  }
  endTurn(next, "bot_turn", events, seat);
  return { state: next, events };
}

/**
 * Ends the current turn without a model action. Used by the orchestrator when
 * a seat exhausts its retries or a fatal upstream error forces a forfeit.
 */
export function forceEndTurn(
  state: GameState,
  reason: TurnEndReason,
  seat?: Seat,
  reasoning?: string,
): { state: GameState; events: EngineEvent[] } {
  if (state.status === "finished" || state.status === "aborted") {
    return { state: cloneState(state), events: [] };
  }
  const next = cloneState(state);
  const events: EngineEvent[] = [];
  endTurn(next, reason, events, seat, reasoning);
  return { state: next, events };
}

export function abortGame(
  state: GameState,
  reason: Extract<GameOverReason, "aborted" | "cost_limit" | "error"> = "aborted",
): { state: GameState; events: EngineEvent[] } {
  const next = cloneState(state);
  const events: EngineEvent[] = [];
  if (next.status === "finished" || next.status === "aborted") {
    return { state: next, events };
  }
  finishGame(next, null, reason, events);
  return { state: next, events };
}

export function apply(
  state: GameState,
  seat: Seat,
  action: GameAction,
): ApplyResult {
  const text = gameText(state.lang);
  if (state.status === "finished" || state.status === "aborted") {
    return fail("game_over", text.gameOver);
  }

  const seatTeam = teamOfSeat(seat);
  if (seatTeam !== state.turn.team) {
    return fail("wrong_seat", text.notTeamTurn(text.team[seatTeam]));
  }

  if (action.type === "give_clue") {
    if (roleOfSeat(seat) !== "spymaster") {
      return fail("wrong_phase", text.onlySpymasterClues);
    }
    if (state.turn.phase !== "clue") {
      return fail("wrong_phase", text.clueAtTurnStart);
    }

    const invalid = validateClue(state, action.word, action.number);
    if (invalid) return invalid;

    const next = cloneState(state);
    const word = action.word.trim();
    const reasoning = action.reasoning?.trim().slice(0, 300);
    const talk = cleanSay(action.say, state, action.word);
    const say = talk.say;
    const { targets, dropped } = resolveTargets(state, action.targets);
    next.turn = {
      ...next.turn,
      phase: "guess",
      clue: {
        word,
        number: action.number,
        ...(reasoning ? { reasoning } : {}),
        ...(say ? { say } : {}),
      },
      guessesLeft: guessesForClue(action.number),
      guessesMade: 0,
    };

    return {
      ok: true,
      state: next,
      events: [
        {
          type: "clue_given",
          seat,
          data: {
            word,
            number: action.number,
            ...(targets ? { targets } : {}),
            ...(dropped > 0 ? { targetsDropped: dropped } : {}),
            ...(reasoning ? { reasoning } : {}),
            ...sayFields(talk),
          },
        },
      ],
    };
  }

  if (action.type === "guess") {
    if (roleOfSeat(seat) !== "operative") {
      return fail("wrong_phase", text.onlyOperativeGuesses);
    }
    if (state.turn.phase !== "guess") {
      return fail("wrong_phase", text.noClueYet);
    }

    const normalized = normalizeWord(action.word);
    const card = state.board.find((candidate) => candidate.normalized === normalized);
    if (!card) {
      return fail("word_not_on_board", text.notOnBoard(action.word.trim()));
    }
    if (card.revealed) {
      return fail("word_already_revealed", text.alreadyRevealed(card.word));
    }

    const next = cloneState(state);
    const target = next.board.find((candidate) => candidate.id === card.id)!;
    target.revealed = true;

    const result: GuessResult =
      target.color === seatTeam
        ? "own"
        : target.color === otherTeam(seatTeam)
          ? "opponent"
          : target.color === "neutral"
            ? "neutral"
            : "assassin";
    const guessesLeft = Math.max(0, next.turn.guessesLeft - 1);
    const guessesMade = next.turn.guessesMade + 1;
    next.turn = { ...next.turn, guessesLeft, guessesMade };

    const events: EngineEvent[] = [
      {
        type: "guess_made",
        seat,
        data: {
          word: target.word,
          color: target.color,
          result,
          guessesLeft,
          guessesMade,
          ...sayFields(cleanSay(action.say, state, action.word)),
        },
      },
    ];

    if (result === "assassin") {
      finishGame(next, otherTeam(seatTeam), "assassin", events);
      return { ok: true, state: next, events };
    }

    if (result === "own" && remainingCards(next)[seatTeam] === 0) {
      finishGame(next, seatTeam, "all_cards", events);
      return { ok: true, state: next, events };
    }

    // Revealing the rival's last agent makes the rival win on this turn.
    if (result === "opponent" && remainingCards(next)[otherTeam(seatTeam)] === 0) {
      finishGame(next, otherTeam(seatTeam), "all_cards", events);
      return { ok: true, state: next, events };
    }

    if (result === "own" && guessesLeft > 0) {
      return { ok: true, state: next, events };
    }

    if (result === "own") {
      endTurn(next, "guesses_exhausted", events, seat);
      return { ok: true, state: next, events };
    }

    endTurn(
      next,
      result === "opponent" ? "opponent_card" : "neutral_card",
      events,
      seat,
    );
    return { ok: true, state: next, events };
  }

  if (action.type === "stop") {
    if (roleOfSeat(seat) !== "operative") {
      return fail("wrong_phase", text.onlyOperativeStops);
    }
    if (state.turn.phase !== "guess") {
      return fail("wrong_phase", text.stopAfterClue);
    }
    if (state.turn.guessesMade === 0) {
      return fail("must_guess", text.mustGuess);
    }
    const next = cloneState(state);
    const events: EngineEvent[] = [];
    endTurn(
      next,
      "stopped",
      events,
      seat,
      action.reasoning?.trim().slice(0, 300),
      cleanSay(action.say, state),
    );
    return { ok: true, state: next, events };
  }

  return fail("invalid_action", text.unknownAction);
}
