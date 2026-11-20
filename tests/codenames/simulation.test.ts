import { describe, expect, it } from "vitest";
import { createGame } from "../../src/lib/codenames/engine";
import {
  alwaysAssassinPolicy,
  alwaysOwnPolicy,
  alwaysStopPolicy,
  makeRandomPolicy,
  playFakeGame,
} from "../../src/lib/codenames/fake-agents";
import { replayEvents } from "../../src/lib/codenames/replay";
import type { GameState } from "../../src/lib/codenames/types";
import { newGame } from "./helpers";

function assertFinished(state: GameState) {
  expect(state.status).toBe("finished");
  expect(state.winner).not.toBeNull();
  expect(state.board).toHaveLength(25);
  expect(state.board.every((card) => typeof card.revealed === "boolean")).toBe(
    true,
  );
}

describe("fake agents", () => {
  it("plays a complete game with random legal actions", () => {
    const game = playFakeGame({ seed: 123, policy: makeRandomPolicy(123) });
    assertFinished(game.state);
    expect(game.events.at(0)?.type).toBe("game_started");
    expect(game.events.at(-1)?.type).toBe("game_over");
  });

  it("reaches a win by revealing every own card", () => {
    const game = playFakeGame({ seed: 8, policy: alwaysOwnPolicy });
    assertFinished(game.state);
    expect(game.state.winReason).toBe("all_cards");
  });

  it("loses on the assassin", () => {
    const game = playFakeGame({ seed: 8, policy: alwaysAssassinPolicy });
    assertFinished(game.state);
    expect(game.state.winReason).toBe("assassin");
  });

  it("always makes the mandatory first guess before stopping", () => {
    const game = playFakeGame({ seed: 8, policy: alwaysStopPolicy });
    assertFinished(game.state);
    for (const event of game.events) {
      if (event.type === "turn_ended" && event.data.reason === "stopped") {
        const index = game.events.indexOf(event);
        expect(game.events[index - 1]?.type).toBe("guess_made");
      }
    }
  });
});

describe("replay", () => {
  it("rebuilds the same state from the event log", () => {
    const game = playFakeGame({ seed: 321, policy: makeRandomPolicy(321) });
    const replayed = replayEvents(game.events);

    expect(replayed.board.map((card) => card.word)).toEqual(
      game.state.board.map((card) => card.word),
    );
    expect(replayed.board.map((card) => card.color)).toEqual(
      game.state.board.map((card) => card.color),
    );
    expect(replayed.board.map((card) => card.revealed)).toEqual(
      game.state.board.map((card) => card.revealed),
    );
    expect(replayed.turn.team).toBe(game.state.turn.team);
    expect(replayed.turn.phase).toBe(game.state.turn.phase);
    expect(replayed.turn.clue).toEqual(game.state.turn.clue);
    expect(replayed.turn.guessesLeft).toBe(game.state.turn.guessesLeft);
    expect(replayed.turn.guessesMade).toBe(game.state.turn.guessesMade);
    expect(replayed.status).toBe(game.state.status);
    expect(replayed.winner).toBe(game.state.winner);
    expect(replayed.winReason).toBe(game.state.winReason);
    expect(replayed.turnsPlayed).toBe(game.state.turnsPlayed);
  });

  it("round-trips a deterministic board", () => {
    const created = createGame({ id: "r", seed: 55, createdAt: 10 });
    const replayed = replayEvents(created.events);
    expect(replayed.board).toEqual(created.state.board);
    expect(replayed.startingTeam).toBe(created.state.startingTeam);
  });
});

describe("simulation gate", () => {
  it("finishes 1000 random games without illegal unresolved actions", () => {
    for (let seed = 0; seed < 1000; seed += 1) {
      const game = playFakeGame({
        seed,
        policy: makeRandomPolicy(seed),
        id: `sim-${seed}`,
      });
      if (game.state.status !== "finished") {
        throw new Error(`La partida ${seed} no terminó.`);
      }
      if (game.events.at(-1)?.type !== "game_over") {
        throw new Error(`La partida ${seed} no emitió game_over.`);
      }
    }
  }, 60_000);

  it("is deterministic across two runs of the same seed", () => {
    const first = playFakeGame({ seed: 444, policy: makeRandomPolicy(444) });
    const second = playFakeGame({ seed: 444, policy: makeRandomPolicy(444) });
    expect(first.state.board).toEqual(second.state.board);
    expect(first.state.winner).toBe(second.state.winner);
    expect(first.events).toEqual(second.events);
  });
});

describe("board invariants", () => {
  it("keeps the standard counts after any number of games", () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const state = newGame(seed);
      const counts = state.board.reduce<Record<string, number>>(
        (result, card) => {
          result[card.color] = (result[card.color] ?? 0) + 1;
          return result;
        },
        {},
      );
      expect(counts[state.startingTeam]).toBe(9);
      expect(counts[state.startingTeam === "red" ? "blue" : "red"]).toBe(8);
      expect(counts.neutral).toBe(7);
      expect(counts.assassin).toBe(1);
    }
  });
});
