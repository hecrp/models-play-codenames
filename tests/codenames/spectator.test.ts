import { describe, expect, it } from "vitest";
import { createGame } from "../../src/lib/codenames/engine";
import { applySpectatorEvent } from "../../src/lib/codenames/spectator-reducer";
import { playFakeGame, makeRandomPolicy } from "../../src/lib/codenames/fake-agents";

describe("spectator reducer", () => {
  it("keeps the same board and turn as the engine after a full game", () => {
    const game = playFakeGame({ seed: 2024, policy: makeRandomPolicy(2024) });
    const created = createGame({ id: game.state.id, seed: 2024, createdAt: game.state.createdAt });
    let state = created.state;
    for (const event of game.events) {
      state = applySpectatorEvent(state, {
        ...event,
        id: 0,
        at: 0,
      } as typeof event & { id: number; at: number });
    }

    expect(state.board.map((card) => card.revealed)).toEqual(
      game.state.board.map((card) => card.revealed),
    );
    expect(state.board.map((card) => card.color)).toEqual(
      game.state.board.map((card) => card.color),
    );
    expect(state.turn.team).toBe(game.state.turn.team);
    expect(state.turn.phase).toBe(game.state.turn.phase);
    expect(state.turn.clue).toEqual(game.state.turn.clue);
    expect(state.turn.guessesLeft).toBe(game.state.turn.guessesLeft);
    expect(state.turnsPlayed).toBe(game.state.turnsPlayed);
    expect(state.status).toBe(game.state.status);
    expect(state.winner).toBe(game.state.winner);
    expect(state.winReason).toBe(game.state.winReason);
  });
});
