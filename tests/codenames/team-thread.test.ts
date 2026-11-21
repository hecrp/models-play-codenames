import { describe, expect, it } from "vitest";
import { apply, createGame } from "../../src/lib/codenames/engine";
import { operativeSeat, otherTeam, spymasterSeat } from "../../src/lib/codenames/seats";
import { buildTeamThread } from "../../src/lib/codenames/team-thread";
import type {
  EngineEvent,
  GameAction,
  GameState,
  Seat,
  StoredGameEvent,
} from "../../src/lib/codenames/types";
import { cardOfColor, safeClue } from "./helpers";

function recorder() {
  const events: StoredGameEvent[] = [];
  const push = (list: EngineEvent[]) => {
    for (const event of list) {
      events.push({ ...event, id: events.length + 1, at: events.length } as StoredGameEvent);
    }
  };
  return { events, push };
}

describe("buildTeamThread", () => {
  it("turns one team's moves into a chat between its two seats", () => {
    const created = createGame({ id: "thread", seed: 42, createdAt: 1 });
    const { events, push } = recorder();
    push(created.events);
    let state: GameState = created.state;
    const team = state.turn.team;
    const play = (seat: Seat, action: GameAction) => {
      const result = apply(state, seat, action);
      if (!result.ok) throw new Error(result.message);
      state = result.state;
      push(result.events);
    };

    play(spymasterSeat(team), {
      type: "give_clue",
      word: safeClue(state),
      number: 2,
      say: "Tengo dos que van juntas.",
    });
    play(operativeSeat(team), {
      type: "guess",
      word: cardOfColor(state, team).word,
      say: "Voy con la más clara.",
    });
    push([
      {
        type: "agent_error",
        seat: operativeSeat(team),
        data: { code: "word_not_on_board", message: "No está", attemptsLeft: 2, phase: "guess" },
      },
    ]);
    play(operativeSeat(team), { type: "stop", say: "Me planto aquí." });

    const thread = buildTeamThread(events, team);
    expect(thread.map((item) => item.kind)).toEqual(["turn", "clue", "guess", "rejected", "stop"]);
    expect(thread[1]).toMatchObject({ kind: "clue", number: 2, say: "Tengo dos que van juntas." });
    expect(thread[2]).toMatchObject({ kind: "guess", result: "own", say: "Voy con la más clara." });
    expect(thread[4]).toMatchObject({ kind: "stop", say: "Me planto aquí." });

    // The rival only sees the start of its own turn.
    expect(buildTeamThread(events, otherTeam(team)).map((item) => item.kind)).toEqual(["turn"]);
  });

  it("keeps the reasoning behind each move, and none when it was redacted", () => {
    const created = createGame({ id: "thought", seed: 42, createdAt: 1 });
    const { events, push } = recorder();
    push(created.events);
    const team = created.state.turn.team;
    const result = apply(created.state, spymasterSeat(team), {
      type: "give_clue",
      word: safeClue(created.state),
      number: 2,
      reasoning: "Dos cartas de cocina.",
    });
    if (!result.ok) throw new Error(result.message);
    push(result.events);
    const clue = events[events.length - 1];
    clue.meta = { modelId: "deepseek/x", reasoning: "Pienso en la cocina…", reasoningEffort: "low", reasoningTokens: 420 };

    const item = buildTeamThread(events, team).find((entry) => entry.kind === "clue");
    expect(item).toMatchObject({
      turn: 1,
      thought: {
        text: "Pienso en la cocina…",
        note: "Dos cartas de cocina.",
        modelId: "deepseek/x",
        effort: "low",
        reasoningTokens: 420,
      },
    });

    // A human operative's view strips meta and reasoning: no button to show.
    clue.meta = undefined;
    (clue.data as { reasoning?: string }).reasoning = undefined;
    const redacted = buildTeamThread(events, team).find((entry) => entry.kind === "clue");
    expect(redacted && "thought" in redacted ? redacted.thought : undefined).toBeUndefined();
  });
});
