import { describe, expect, it } from "vitest";
import {
  HumanInbox,
  redactEvent,
  redactState,
  resolveGuess,
} from "../../src/lib/server/codenames/human";
import { createGame } from "../../src/lib/codenames/engine";
import { spymasterSeat, operativeSeat } from "../../src/lib/codenames/seats";
import { viewFor } from "../../src/lib/codenames/view";
import { newGame, safeClue } from "./helpers";

describe("HumanInbox", () => {
  it("rejects illegal actions without resolving and accepts a legal one", async () => {
    const state = newGame();
    const seat = spymasterSeat(state.turn.team);
    const inbox = new HumanInbox();
    const pending = inbox.wait({
      seat,
      view: viewFor(seat, state),
      config: { seat, modelId: "human", temperature: 0, avatarId: "zorro", displayName: "Yo", human: true },
    });

    expect(inbox.submit(operativeSeat(state.turn.team), { type: "stop" }, state)).toMatchObject({ ok: false });
    expect(
      inbox.submit(seat, { type: "give_clue", word: state.board[0].word, number: 1 }, state),
    ).toMatchObject({ ok: false });

    const clue = safeClue(state, 2);
    expect(inbox.submit(seat, { type: "give_clue", word: clue, number: 2 }, state)).toEqual({ ok: true });
    await expect(pending).resolves.toMatchObject({ action: { type: "give_clue", word: clue } });
    expect(inbox.waitingSeat).toBeNull();
  });
});

describe("resolveGuess", () => {
  it("matches ignoring case and accents without calling a model", async () => {
    await expect(resolveGuess("  cAMIÓN ", ["CAMION", "MAR"], null)).resolves.toEqual({
      kind: "exact",
      word: "CAMION",
    });
    await expect(resolveGuess("xyz", ["CAMION"], null)).resolves.toEqual({ kind: "unknown" });
  });
});

describe("redaction", () => {
  it("hides unrevealed colors", () => {
    const created = createGame({ id: "r", seed: 3, createdAt: 1 });
    const state = redactState(created.state);
    expect(state.board.every((card) => card.color === "neutral")).toBe(true);
    const started = redactEvent({ ...created.events[0], id: 1, at: 1 });
    if (started.type === "game_started") {
      expect(started.data.board.every((card) => card.color === "neutral")).toBe(true);
    }
  });
});
