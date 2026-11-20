import { describe, expect, it } from "vitest";
import { apply, createGame } from "../../src/lib/codenames/engine";
import { operativeSeat, spymasterSeat } from "../../src/lib/codenames/seats";
import {
  buildPublicHistory,
  viewFor,
} from "../../src/lib/codenames/view";
import { ok, safeClue } from "./helpers";

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

  it("shows the say in the public history", () => {
    const { state, events } = startedGame(13);
    const team = state.turn.team;
    const say = "Esta pista me huele a cocina.";
    const result = ok(
      apply(state, spymasterSeat(team), {
        type: "give_clue",
        word: safeClue(state),
        number: 2,
        say,
      }),
    );
    const history = buildPublicHistory([...events, ...result.events]).join("\n");
    expect(history).toContain(say);
  });
});

describe("buildPublicHistory", () => {
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
