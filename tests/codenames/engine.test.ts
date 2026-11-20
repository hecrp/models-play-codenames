import { describe, expect, it } from "vitest";
import {
  abortGame,
  apply,
  createGame,
  forceEndTurn,
  remainingCards,
  validateClue,
} from "../../src/lib/codenames/engine";
import { otherTeam, operativeSeat, spymasterSeat } from "../../src/lib/codenames/seats";
import type { GameState, Seat } from "../../src/lib/codenames/types";
import {
  cardOfColor,
  newGame,
  ok,
  playAction,
  safeClue,
} from "./helpers";

function countColors(state: GameState) {
  return state.board.reduce<Record<string, number>>((counts, card) => {
    counts[card.color] = (counts[card.color] ?? 0) + 1;
    return counts;
  }, {});
}

function giveClue(state: GameState, number = 2): GameState {
  return playAction(state, spymasterSeat(state.turn.team), {
    type: "give_clue",
    word: safeClue(state, number),
    number,
  });
}

function guess(state: GameState, word: string): GameState {
  return playAction(state, operativeSeat(state.turn.team), {
    type: "guess",
    word,
  });
}

describe("createGame", () => {
  it("is deterministic for the same seed", () => {
    const first = createGame({ id: "a", seed: 42, createdAt: 1 });
    const second = createGame({ id: "b", seed: 42, createdAt: 1 });

    expect(first.state.board).toEqual(second.state.board);
    expect(first.state.startingTeam).toBe(second.state.startingTeam);
    expect(first.events).toEqual(second.events);
  });

  it("assigns the standard card counts", () => {
    const state = newGame(7);
    const other = otherTeam(state.startingTeam);

    expect(state.board).toHaveLength(25);
    expect(new Set(state.board.map((card) => card.normalized)).size).toBe(25);
    expect(countColors(state)).toEqual({
      [state.startingTeam]: 9,
      [other]: 8,
      neutral: 7,
      assassin: 1,
    });
  });

  it("emits game_started and turn_started", () => {
    const { events } = createGame({ id: "x", seed: 1, createdAt: 1 });
    expect(events.map((event) => event.type)).toEqual([
      "game_started",
      "turn_started",
    ]);
    expect(events[0].type).toBe("game_started");
    if (events[0].type === "game_started") {
      expect(events[0].data.board).toHaveLength(25);
    }
  });

  it("produces different boards for different seeds", () => {
    const first = newGame(1).board.map((card) => card.word).join(",");
    const second = newGame(2).board.map((card) => card.word).join(",");
    expect(first).not.toBe(second);
  });
});

describe("validateClue", () => {
  it("rejects a word that is on the board", () => {
    const state = newGame();
    const card = state.board.find((candidate) => !candidate.revealed)!;
    const error = validateClue(state, card.word.toLowerCase(), 2);
    expect(error?.code).toBe("clue_on_board");
  });

  it("rejects a clue contained in or containing a hidden word", () => {
    const state = newGame();
    const card = state.board.find((candidate) => candidate.word.length >= 5)!;
    const fragment = card.word.slice(0, 3);
    const error = validateClue(state, fragment, 2);
    expect(error?.code).toBe("clue_on_board");
  });

  it("rejects spaces, hyphens and punctuation", () => {
    const state = newGame();
    expect(validateClue(state, "DOS PALABRAS", 2)?.code).toBe(
      "clue_not_single_word",
    );
    expect(validateClue(state, "MAR-", 2)?.code).toBe("clue_not_single_word");
    expect(validateClue(state, "MAR.", 2)?.code).toBe("clue_not_single_word");
    expect(validateClue(state, "  ", 2)?.code).toBe("clue_not_single_word");
  });

  it("rejects numbers outside 0..9", () => {
    const state = newGame();
    const clue = safeClue(state);
    expect(validateClue(state, clue, 10)?.code).toBe("number_out_of_range");
    expect(validateClue(state, clue, -1)?.code).toBe("number_out_of_range");
    expect(validateClue(state, clue, 1.5)?.code).toBe("number_out_of_range");
  });

  it("accepts a safe word", () => {
    const state = newGame();
    expect(validateClue(state, safeClue(state), 2)).toBeNull();
  });

  it("rejects the plural form of a hidden word", () => {
    const base = newGame();
    const state: GameState = {
      ...base,
      board: base.board.map((card, index) =>
        index === 0 ? { ...card, word: "PEZ", normalized: "pez" } : card,
      ),
    };
    expect(validateClue(state, "peces", 1)?.code).toBe("clue_on_board");
  });
});

describe("turns", () => {
  it("accepts a clue from the spymaster and moves to guessing", () => {
    const state = newGame();
    const team = state.turn.team;
    const clue = safeClue(state, 3);
    const result = ok(
      apply(state, spymasterSeat(team), {
        type: "give_clue",
        word: clue,
        number: 3,
      }),
    );

    expect(result.state.turn.phase).toBe("guess");
    expect(result.state.turn.guessesLeft).toBe(4);
    expect(result.state.turn.clue?.word).toBe(clue);
    expect(result.events[0].type).toBe("clue_given");
  });

  it("rejects the wrong role, phase and team", () => {
    const state = newGame();
    const team = state.turn.team;

    expect(
      apply(state, operativeSeat(team), {
        type: "give_clue",
        word: safeClue(state),
        number: 1,
      }),
    ).toMatchObject({ ok: false, code: "wrong_phase" });

    expect(
      apply(state, spymasterSeat(otherTeam(team)), {
        type: "give_clue",
        word: safeClue(state),
        number: 1,
      }),
    ).toMatchObject({ ok: false, code: "wrong_seat" });

    const afterClue = giveClue(state, 1);
    expect(
      apply(afterClue, spymasterSeat(team), {
        type: "give_clue",
        word: safeClue(afterClue),
        number: 1,
      }),
    ).toMatchObject({ ok: false, code: "wrong_phase" });
  });

  it("reveals an own card and keeps the turn", () => {
    const state = giveClue(newGame(), 9);
    const team = state.turn.team;
    const card = cardOfColor(state, team);
    const result = ok(
      apply(state, operativeSeat(team), { type: "guess", word: card.word }),
    );

    expect(result.state.turn.team).toBe(team);
    expect(result.state.turn.phase).toBe("guess");
    expect(result.state.turn.guessesLeft).toBe(9);
    expect(
      result.state.board.find((candidate) => candidate.id === card.id)?.revealed,
    ).toBe(true);
    const event = result.events[0];
    expect(event.type).toBe("guess_made");
    if (event.type === "guess_made") {
      expect(event.data.result).toBe("own");
      expect(event.data.color).toBe(team);
    }
  });

  it("ends the turn on a rival card", () => {
    const state = giveClue(newGame(), 2);
    const team = state.turn.team;
    const card = cardOfColor(state, otherTeam(team));
    const result = ok(
      apply(state, operativeSeat(team), { type: "guess", word: card.word }),
    );

    expect(result.state.turn.team).toBe(otherTeam(team));
    expect(result.state.turn.phase).toBe("clue");
    expect(result.state.turnsPlayed).toBe(2);
    expect(result.events.map((event) => event.type)).toEqual([
      "guess_made",
      "turn_ended",
      "turn_started",
    ]);
    const ended = result.events[1];
    if (ended.type === "turn_ended") {
      expect(ended.data.reason).toBe("opponent_card");
      expect(ended.data.nextTeam).toBe(otherTeam(team));
    }
  });

  it("ends the turn on a neutral card", () => {
    const state = giveClue(newGame(), 2);
    const team = state.turn.team;
    const card = cardOfColor(state, "neutral");
    const result = ok(
      apply(state, operativeSeat(team), { type: "guess", word: card.word }),
    );

    expect(result.state.turn.team).toBe(otherTeam(team));
    const ended = result.events[1];
    if (ended.type === "turn_ended") {
      expect(ended.data.reason).toBe("neutral_card");
    }
  });

  it("loses immediately on the assassin", () => {
    const state = giveClue(newGame(), 2);
    const team = state.turn.team;
    const card = cardOfColor(state, "assassin");
    const result = ok(
      apply(state, operativeSeat(team), { type: "guess", word: card.word }),
    );

    expect(result.state.status).toBe("finished");
    expect(result.state.winner).toBe(otherTeam(team));
    expect(result.state.winReason).toBe("assassin");
    expect(result.events.at(-1)?.type).toBe("game_over");
  });

  it("lets the operative stop after the first guess", () => {
    const clued = giveClue(newGame(), 9);
    const team = clued.turn.team;
    const state = guess(clued, cardOfColor(clued, team).word);
    const result = ok(
      apply(state, operativeSeat(team), {
        type: "stop",
        reasoning: "No estoy seguro.",
      }),
    );

    expect(result.state.turn.team).toBe(otherTeam(team));
    expect(result.state.turn.phase).toBe("clue");
    const ended = result.events[0];
    if (ended.type === "turn_ended") {
      expect(ended.data.reason).toBe("stopped");
      expect(ended.data.reasoning).toBe("No estoy seguro.");
    }
  });

  it("requires at least one guess before stopping", () => {
    const state = giveClue(newGame(), 2);
    expect(
      apply(state, operativeSeat(state.turn.team), { type: "stop" }),
    ).toMatchObject({ ok: false, code: "must_guess" });
  });

  it("ends the turn when the guesses are exhausted", () => {
    let state = giveClue(newGame(), 1);
    const team = state.turn.team;
    state = guess(state, cardOfColor(state, team).word);
    const card = cardOfColor(state, team);
    const result = ok(
      apply(state, operativeSeat(team), { type: "guess", word: card.word }),
    );

    expect(result.state.turn.team).toBe(otherTeam(team));
    const ended = result.events[1];
    if (ended.type === "turn_ended") {
      expect(ended.data.reason).toBe("guesses_exhausted");
    }
  });

  it("gives unlimited guesses for a zero clue", () => {
    let state = giveClue(newGame(), 0);
    const team = state.turn.team;
    for (let index = 0; index < 3; index += 1) {
      state = guess(state, cardOfColor(state, team).word);
    }
    expect(state.turn.team).toBe(team);
    expect(state.turn.phase).toBe("guess");
    expect(state.turn.guessesMade).toBe(3);
  });

  it("makes the rival win when their last agent is revealed", () => {
    const base = newGame(99);
    const team = base.turn.team;
    const rivalCards = base.board.filter((card) => card.color === otherTeam(team));
    const last = rivalCards[rivalCards.length - 1];
    const state: GameState = {
      ...base,
      board: base.board.map((card) =>
        card.color === otherTeam(team) && card.id !== last.id
          ? { ...card, revealed: true }
          : card,
      ),
    };
    const result = ok(
      apply(giveClue(state, 1), operativeSeat(team), { type: "guess", word: last.word }),
    );
    expect(result.state.status).toBe("finished");
    expect(result.state.winner).toBe(otherTeam(team));
    expect(result.state.winReason).toBe("all_cards");
  });

  it("rejects unknown and already revealed words", () => {
    const state = giveClue(newGame(), 9);
    const team = state.turn.team;
    expect(
      apply(state, operativeSeat(team), { type: "guess", word: "NOEXISTE" }),
    ).toMatchObject({ ok: false, code: "word_not_on_board" });

    const card = cardOfColor(state, team);
    const after = guess(state, card.word);
    expect(
      apply(after, operativeSeat(team), { type: "guess", word: card.word }),
    ).toMatchObject({ ok: false, code: "word_already_revealed" });
  });

  it("wins when the last own card is revealed", () => {
    const base = newGame(99);
    const team = base.turn.team;
    const ownCards = base.board.filter((card) => card.color === team);
    const last = ownCards[ownCards.length - 1];
    const state: GameState = {
      ...base,
      board: base.board.map((card) =>
        card.id === last.id ? { ...card } : { ...card, revealed: true },
      ),
    };

    const withClue = giveClue(state, 1);
    const result = ok(
      apply(withClue, operativeSeat(team), { type: "guess", word: last.word }),
    );

    expect(result.state.status).toBe("finished");
    expect(result.state.winner).toBe(team);
    expect(result.state.winReason).toBe("all_cards");
    expect(remainingCards(result.state)[team]).toBe(0);
  });

  it("does not mutate the input state", () => {
    const state = giveClue(newGame(), 2);
    const snapshot = JSON.stringify(state);
    const card = cardOfColor(state, state.turn.team);
    apply(state, operativeSeat(state.turn.team), {
      type: "guess",
      word: card.word,
    });
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});

describe("turn limit", () => {
  it("finishes after 40 turns and picks the team with fewer cards left", () => {
    const base = newGame(5);
    let state: GameState = { ...base, turnsPlayed: 40 };
    state = giveClue(state, 1);
    state = guess(state, cardOfColor(state, "neutral").word);

    expect(state.status).toBe("finished");
    expect(state.winReason).toBe("turn_limit");
    expect(state.turnsPlayed).toBe(40);
    const remaining = remainingCards(state);
    const expected =
      remaining.red < remaining.blue
        ? "red"
        : remaining.blue < remaining.red
          ? "blue"
          : "draw";
    expect(state.winner).toBe(expected);
  });

  it("declares a draw when both teams have the same cards left", () => {
    const base = newGame(6);
    const startingCard = base.board.find(
      (card) => card.color === base.startingTeam,
    )!;
    const state: GameState = {
      ...base,
      turnsPlayed: 40,
      board: base.board.map((card) =>
        card.id === startingCard.id ? { ...card, revealed: true } : card,
      ),
    };

    const result = forceEndTurn(state, "stopped", operativeSeat(state.turn.team));
    expect(result.state.status).toBe("finished");
    expect(result.state.winReason).toBe("turn_limit");
    expect(result.state.winner).toBe("draw");
  });
});

describe("abort", () => {
  it("marks the game as aborted", () => {
    const result = abortGame(newGame());
    expect(result.state.status).toBe("aborted");
    expect(result.state.winner).toBeNull();
    expect(result.events[0].type).toBe("game_over");
    if (result.events[0].type === "game_over") {
      expect(result.events[0].data.reason).toBe("aborted");
    }
  });

  it("rejects actions after the game is over", () => {
    const state = abortGame(newGame()).state;
    const seat: Seat = spymasterSeat(state.turn.team);
    expect(
      apply(state, seat, { type: "give_clue", word: "PLAN", number: 1 }),
    ).toMatchObject({ ok: false, code: "game_over" });
  });

  it("accepts a cost-limit abort reason", () => {
    const result = abortGame(newGame(), "cost_limit");
    expect(result.state.status).toBe("aborted");
    expect(result.state.winReason).toBe("cost_limit");
  });
});
