import { describe, expect, it } from "vitest";
import { apply, createGame } from "../../src/lib/codenames/engine";
import { operativeSeat, spymasterSeat } from "../../src/lib/codenames/seats";
import {
  buildClueMemory,
  buildPublicHistory,
  viewFor,
} from "../../src/lib/codenames/view";
import { buildAgentPrompt, PROMPT_VERSION, promptVersionFor } from "../../src/lib/codenames/prompts";
import { redactEvent, redactState } from "../../src/lib/server/codenames/human";
import { ok, safeClue } from "./helpers";
import { validateClue } from "../../src/lib/codenames/engine";
import type { StoredGameEvent, Team } from "../../src/lib/codenames/types";

function startedGame(seed = 42) {
  return createGame({ id: `view-${seed}`, seed, createdAt: 1 });
}

describe("viewFor", () => {
  it("hides unrevealed colors from operatives", () => {
    const { state } = startedGame();
    const view = viewFor(operativeSeat(state.turn.team), state, []);

    expect(view.ownWords).toBeNull();
    expect(view.opponentWords).toBeNull();
    expect(view.neutralWords).toBeNull();
    expect(view.assassinWord).toBeNull();
    for (const card of view.board) {
      if (!card.revealed) expect(card.color).toBeNull();
    }
    expect(view.revealed).toEqual([]);
  });

  it("never serializes hidden colors for an operative", () => {
    const { state } = startedGame();
    const view = viewFor(operativeSeat(state.turn.team), state, []);
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain('"assassin"');
    expect(serialized).not.toContain('"neutral"');
  });

  it("shows all colors to spymasters", () => {
    const { state } = startedGame();
    const team = state.turn.team;
    const view = viewFor(spymasterSeat(team), state, []);

    expect(view.board.every((card) => card.color !== null)).toBe(true);
    const total =
      (view.ownWords?.length ?? 0) +
      (view.opponentWords?.length ?? 0) +
      (view.neutralWords?.length ?? 0) +
      (view.assassinWord ? 1 : 0);
    expect(total).toBe(25);
    expect(view.assassinWord).toBeTruthy();
  });

  it("shows all colors to spectators", () => {
    const { state } = startedGame();
    const view = viewFor("spectator", state, ["historial"]);
    expect(view.board.every((card) => card.color !== null)).toBe(true);
    expect(view.team).toBeNull();
    expect(view.history).toEqual(["historial"]);
  });

  it("only exposes revealed colors to operatives after a guess", () => {
    const base = startedGame();
    const team = base.state.turn.team;
    const withClue = ok(
      apply(base.state, spymasterSeat(team), {
        type: "give_clue",
        word: safeClue(base.state),
        number: 2,
      }),
    ).state;
    const own = withClue.board.find(
      (card) => !card.revealed && card.color === team,
    )!;
    const after = ok(
      apply(withClue, operativeSeat(team), {
        type: "guess",
        word: own.word,
      }),
    ).state;

    const view = viewFor(operativeSeat(team), after, []);
    const revealed = view.board.find((card) => card.id === own.id)!;
    expect(revealed.color).toBe(team);
    expect(view.revealed).toEqual([{ word: own.word, color: team }]);
  });
});

describe("table talk", () => {
  it("keeps the say on the clue and the event", () => {
    const { state } = startedGame(7);
    const team = state.turn.team;
    const say = "Mi agente lo va a ver claro, yo confío en esta pista.";
    const result = ok(
      apply(state, spymasterSeat(team), {
        type: "give_clue",
        word: safeClue(state),
        number: 2,
        say,
      }),
    );

    expect(result.state.turn.clue?.say).toBe(say);
    const event = result.events.find((item) => item.type === "clue_given");
    expect(event && "data" in event ? event.data.say : null).toBe(say);
  });

  it("redacts hidden board words from the say", () => {
    const { state } = startedGame(11);
    const team = state.turn.team;
    const hidden = state.board.find((card) => !card.revealed)!;
    const result = ok(
      apply(state, spymasterSeat(team), {
        type: "give_clue",
        word: safeClue(state),
        number: 1,
        say: `Cuidado con ${hidden.word} y sobre todo con ${hidden.word.toLowerCase()}.`,
      }),
    );

    const say = result.state.turn.clue?.say ?? "";
    expect(say).not.toContain(hidden.word);
    expect(say).not.toContain(hidden.word.toLowerCase());
    expect(say).toContain("…");
  });

  it("keeps the spymaster silent: no player reads their aside", () => {
    const { state, events } = startedGame(13);
    const team = state.turn.team;
    const aside = "Dos que van de la mano en cualquier cuento.";
    const clue = safeClue(state);
    const given = ok(
      apply(state, spymasterSeat(team), {
        type: "give_clue",
        word: clue,
        number: 2,
        say: aside,
        reasoning: "PLAN PRIVADO",
      }),
    );
    // The aside is still recorded for the audience.
    const clueEvent = given.events.find((event) => event.type === "clue_given");
    expect(clueEvent && "say" in clueEvent.data ? clueEvent.data.say : undefined).toBe(aside);

    const history = buildPublicHistory([...events, ...given.events]).join("\n");
    expect(history).toContain(`«${clue}» 2`);
    expect(history).not.toContain(aside);

    for (const seat of [operativeSeat(team), spymasterSeat(team === "red" ? "blue" : "red")]) {
      const view = viewFor(seat, given.state, buildPublicHistory([...events, ...given.events]));
      const serialized = JSON.stringify(view);
      expect(serialized).not.toContain(aside);
      expect(serialized).not.toContain("PLAN PRIVADO");
      expect(view.turn.clue).toEqual({ word: clue, number: 2 });
    }
    expect(viewFor("spectator", given.state).turn.clue?.say).toBe(aside);
  });

  it("lets every player read the operatives' table talk", () => {
    const { state, events } = startedGame(13);
    const team = state.turn.team;
    const given = ok(
      apply(state, spymasterSeat(team), { type: "give_clue", word: safeClue(state), number: 2 }),
    );
    const own = given.state.board.find((card) => !card.revealed && card.color === team)!;
    const say = "Voy a por la más clara primero.";
    const guessed = ok(apply(given.state, operativeSeat(team), { type: "guess", word: own.word, say }));
    const history = buildPublicHistory([...events, ...given.events, ...guessed.events]).join("\n");
    expect(history).toContain(say);
  });
});

describe("buildPublicHistory", () => {
  it("leaves rejected moves out: they can name hidden cards or quote the model", () => {
    const { state, events } = startedGame(21);
    const team = state.turn.team;
    const own = state.board.find((card) => !card.revealed && card.color === team)!;
    const assassin = state.board.find((card) => card.color === "assassin")!;

    // A clue on one of the spymaster's own cards: the referee names the card.
    const rejected = validateClue(state, `${own.word.toLowerCase()}s`, 2)!;
    expect(rejected.code).toBe("clue_on_board");
    expect(rejected.message).toContain(own.word);
    // A model that wrote its plan instead of calling the tool.
    const text = `I aim at ${own.word} and keep away from ${assassin.word}`;
    const errors = [
      {
        id: 100,
        at: 100,
        type: "agent_error",
        seat: spymasterSeat(team),
        data: { code: rejected.code, message: rejected.message, attemptsLeft: 2, phase: "clue" },
      },
      {
        id: 101,
        at: 101,
        type: "agent_error",
        seat: spymasterSeat(team),
        data: {
          code: "no_tool_call",
          message: `No tool was called. Text received: ${text}`,
          attemptsLeft: 1,
          phase: "clue",
        },
      },
    ] as unknown as StoredGameEvent[];

    const history = buildPublicHistory([...events, ...errors]).join("\n");
    expect(history).not.toContain(own.word);
    expect(history).not.toContain(assassin.word);
    expect(history).not.toContain(text);
    for (const seat of [operativeSeat(team), spymasterSeat(team === "red" ? "blue" : "red")]) {
      const serialized = JSON.stringify(viewFor(seat, state, buildPublicHistory([...events, ...errors])));
      expect(serialized).not.toContain(text);
    }
  });

  it("does not leak hidden colors or reasoning", () => {
    const { state, events } = startedGame();
    const team = state.turn.team;
    const clue = safeClue(state);
    const result = ok(
      apply(state, spymasterSeat(team), {
        type: "give_clue",
        word: clue,
        number: 2,
        reasoning: "ESTE RAZONAMIENTO NO DEBE SER PÚBLICO",
      }),
    );
    const history = buildPublicHistory([...events, ...result.events]);
    const text = history.join("\n");

    expect(text).not.toContain("ESTE RAZONAMIENTO");
    expect(text).not.toContain("assassin");
    expect(text).not.toContain("neutral");
    expect(text).toContain(`«${clue}» 2`);
    expect(text).toContain("Comienza la partida");
  });

  it("includes public reveals and the winner", () => {
    let { state } = startedGame(77);
    const team = state.turn.team;
    const events = [];
    const withClue = ok(
      apply(state, spymasterSeat(team), {
        type: "give_clue",
        word: safeClue(state),
        number: 9,
      }),
    );
    state = withClue.state;
    events.push(...withClue.events);

    const own = state.board.find(
      (card) => !card.revealed && card.color === team,
    )!;
    const guessed = ok(
      apply(state, operativeSeat(team), { type: "guess", word: own.word }),
    );
    state = guessed.state;
    events.push(...guessed.events);

    const history = buildPublicHistory(events);
    expect(history.some((line) => line.includes(own.word))).toBe(true);
    expect(history.some((line) => line.includes("era de su equipo"))).toBe(
      true,
    );
    expect(state.status).toBe("in_progress");
  });
});

describe("spymaster clue memory", () => {
  /**
   * Red gives a 3-clue with private targets [A, B, C]; red finds A, then hits a
   * neutral card. Blue gives a 1-clue on one of its cards, but its operative
   * reveals B (a red card). C is still pending.
   */
  function playedGame(seed = 31) {
    const created = createGame({ id: `memory-${seed}`, seed, createdAt: 1 });
    let state = created.state;
    const events: StoredGameEvent[] = [];
    const record = (list: ReadonlyArray<unknown>) => {
      for (const event of list) {
        events.push({ ...(event as object), id: events.length + 1, at: events.length + 1 } as StoredGameEvent);
      }
    };
    record(created.events);
    const red = state.turn.team;
    const blue: Team = red === "red" ? "blue" : "red";
    const [a, b, c] = state.board.filter((card) => card.color === red).map((card) => card.word);
    const neutral = state.board.find((card) => card.color === "neutral")!.word;
    const blueTarget = state.board.find((card) => card.color === blue)!.word;

    const step = (seat: Parameters<typeof apply>[1], action: Parameters<typeof apply>[2]) => {
      const result = ok(apply(state, seat, action));
      state = result.state;
      record(result.events);
    };
    const redClue = safeClue(state, 3);
    step(spymasterSeat(red), { type: "give_clue", word: redClue, number: 3, targets: [a, b, c] });
    step(operativeSeat(red), { type: "guess", word: a });
    step(operativeSeat(red), { type: "guess", word: neutral });
    const blueClue = safeClue(state, 1);
    step(spymasterSeat(blue), { type: "give_clue", word: blueClue, number: 1, targets: [blueTarget] });
    step(operativeSeat(blue), { type: "guess", word: b });
    return { state, events, red, blue, a, b, c, redClue, blueClue, blueTarget };
  }

  it("shows the spymaster their own clues and what became of each target", () => {
    const game = playedGame();
    const view = viewFor(spymasterSeat(game.red), game.state, buildPublicHistory(game.events), game.events);
    expect(view.clueMemory).toEqual([
      {
        turn: 1,
        word: game.redClue,
        number: 3,
        targets: [
          { word: game.a, status: "found" },
          { word: game.b, status: "rival" },
          { word: game.c, status: "pending" },
        ],
      },
    ]);

    const prompt = buildAgentPrompt(spymasterSeat(game.red), view).user;
    expect(prompt).toContain("Tus pistas anteriores");
    expect(prompt).toContain(
      `- Turno 1: «${game.redClue}» 3 → ${game.a} (encontrada), ${game.b} (revelada por el rival), ${game.c} (pendiente)`,
    );
  });

  it("never reaches the operative or the rival team, serializing the whole view", () => {
    const game = playedGame();
    const history = buildPublicHistory(game.events);
    const own = viewFor(spymasterSeat(game.red), game.state, history, game.events);
    const secret = JSON.stringify(own.clueMemory![0].targets);
    // The public history has the clue word, never its targets.
    expect(history.join("\n")).not.toContain(game.c);

    for (const seat of [operativeSeat(game.red), operativeSeat(game.blue), spymasterSeat(game.blue)]) {
      const view = viewFor(seat, game.state, history, game.events);
      const serialized = JSON.stringify(view);
      expect(serialized).not.toContain(secret);
      expect(serialized).not.toContain('"found"');
      expect(serialized).not.toContain('"rival"');
      expect(serialized).not.toContain(`"word":"${game.redClue}","number":3,"targets"`);
      const prompt = buildAgentPrompt(seat, view);
      expect(prompt.user).not.toContain(`${game.c} (pendiente)`);
      expect(prompt.user).not.toContain(`${game.a} (encontrada)`);
    }
    // The rival spymaster only remembers its own clue.
    const rival = viewFor(spymasterSeat(game.blue), game.state, history, game.events);
    expect(rival.clueMemory).toEqual([
      { turn: 2, word: game.blueClue, number: 1, targets: [{ word: game.blueTarget, status: "pending" }] },
    ]);
    expect(viewFor(operativeSeat(game.red), game.state, history, game.events).clueMemory).toBeNull();
    expect(viewFor("spectator", game.state, history, game.events).clueMemory).toBeNull();
  });

  it("stays hidden in games with a human: the redacted log carries no targets", () => {
    const game = playedGame();
    const redacted = game.events.map(redactEvent);
    expect(JSON.stringify(redacted)).not.toContain(JSON.stringify([game.a, game.b, game.c]));
    // Even rebuilt from what a human operative can receive, no target survives.
    const rebuilt = buildClueMemory(redacted, game.red);
    expect(rebuilt).toEqual([{ turn: 1, word: game.redClue, number: 3 }]);
    const view = viewFor(operativeSeat(game.red), redactState(game.state), buildPublicHistory(redacted), redacted);
    expect(view.clueMemory).toBeNull();
  });

  it("keeps a whole 40-turn history in the prompt", () => {
    const { state } = startedGame(5);
    const history = Array.from({ length: 190 }, (_, index) => `línea ${index}`);
    const prompt = buildAgentPrompt(spymasterSeat(state.turn.team), viewFor(spymasterSeat(state.turn.team), state, history)).user;
    expect(prompt).toContain("línea 0\n");
    expect(prompt).not.toContain("omitido");
  });
});

describe("rules-only prompt variant", () => {
  it("drops both strategy blocks and keeps the rules", () => {
    const { state } = startedGame(9);
    const team = state.turn.team;
    for (const seat of [spymasterSeat(team), operativeSeat(team)]) {
      const view = viewFor(seat, state, []);
      const full = buildAgentPrompt(seat, view).system;
      const rules = buildAgentPrompt(seat, view, undefined, { variant: "rules" }).system;
      expect(full).toMatch(/CÓMO JUGAR BIEN/);
      expect(rules).not.toMatch(/CÓMO JUGAR BIEN/);
      expect(rules).toContain("REGLAS DE CODENAMES");
      expect(rules).not.toContain("\n\n\n");
    }
    expect(promptVersionFor("rules")).toBe(`${PROMPT_VERSION}-rules`);
    expect(promptVersionFor()).toBe(PROMPT_VERSION);
  });
});
