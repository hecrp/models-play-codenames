import { describe, expect, it } from "vitest";
import { buildTeamThread } from "../../src/lib/codenames/team-thread";
import { pendingThinker, replayDelay, replayEvents } from "../../src/lib/codenames/replay";
import { getDemoEvents, getDemoGame, isDemoGameId } from "../../src/lib/server/codenames/demo-games";
import { DEMO_GAME_IDS, randomDemoId } from "../../src/lib/codenames/demo/ids";
import type { StoredGameEvent, Team } from "../../src/lib/codenames/types";

function event(id: number, body: Record<string, unknown>): StoredGameEvent {
  return { id, at: id, ...body } as unknown as StoredGameEvent;
}

describe("intent vs outcome", () => {
  it("tells what became of each card a clue aimed at", () => {
    const events: StoredGameEvent[] = [
      event(1, { type: "turn_started", data: { turn: 1, team: "red", phase: "clue" } }),
      event(2, {
        type: "clue_given",
        seat: "red_spymaster",
        data: { word: "COCINA", number: 3, targets: ["OLLA", "HORNO", "PLATO", "CUCHARA"] },
      }),
      event(3, { type: "guess_made", seat: "red_operative", data: { word: "OLLA", color: "red", result: "own", guessesLeft: 3, guessesMade: 1 } }),
      event(4, { type: "turn_started", data: { turn: 2, team: "blue", phase: "clue" } }),
      event(5, { type: "guess_made", seat: "blue_operative", data: { word: "PLATO", color: "red", result: "opponent", guessesLeft: 0, guessesMade: 1 } }),
      event(6, { type: "turn_started", data: { turn: 3, team: "red", phase: "clue" } }),
      event(7, { type: "guess_made", seat: "red_operative", data: { word: "HORNO", color: "red", result: "own", guessesLeft: 1, guessesMade: 1 } }),
    ];
    const clue = buildTeamThread(events, "red" as Team).find((item) => item.kind === "clue");
    expect(clue && "targets" in clue ? clue.targets : undefined).toEqual([
      { word: "OLLA", outcome: "hit", turn: 1 },
      { word: "HORNO", outcome: "later", turn: 3 },
      { word: "PLATO", outcome: "rival", turn: 2 },
      { word: "CUCHARA", outcome: "pending" },
    ]);
  });
});

describe("live-like replay pacing", () => {
  it("waits for the next move's thinking and for table talk to be read", () => {
    const thinking = event(1, { type: "thinking", seat: "red_spymaster", data: { state: "start" } });
    const clue = event(2, {
      type: "clue_given",
      seat: "red_spymaster",
      data: { word: "MAR", number: 2, say: "x".repeat(100) },
      meta: { latencyMs: 2000 },
    });
    expect(replayDelay(thinking, clue)).toBe(2000);
    expect(replayDelay(clue, undefined)).toBe(700 + 400 + 1200);
    expect(replayDelay(clue, undefined, 2)).toBe(1150);
    expect(pendingThinker([thinking])).toBe("red_spymaster");
    expect(pendingThinker([thinking, clue])).toBeNull();
  });
});

describe("bundled demo games", () => {
  it.each([...DEMO_GAME_IDS.es, ...DEMO_GAME_IDS.en])("%s replays to the saved result and declares targets", (id) => {
    expect(isDemoGameId(id)).toBe(true);
    const game = getDemoGame(id)!;
    const events = getDemoEvents(id);
    expect(game.status).toBe("finished");
    expect(game.lang).toBe(id.startsWith("demo-es") ? "es" : "en");
    // Recorded with the silent spymaster (prompt v10 or later).
    expect(Number(game.promptVersion.slice(1))).toBeGreaterThanOrEqual(10);
    expect(events.length).toBeGreaterThan(50);
    const state = replayEvents(events);
    expect(state.winner).toBe(game.winner);
    const clues = events.filter((entry) => entry.type === "clue_given");
    expect(clues.length).toBeGreaterThan(5);
    expect(clues.every((entry) => entry.type === "clue_given" && Array.isArray(entry.data.targets))).toBe(true);
    // No raw provider payloads in the bundle.
    expect(events.some((entry) => entry.meta?.rawResponse)).toBe(false);
  });

  it("uses a different board in each demo", () => {
    const seeds = [...DEMO_GAME_IDS.es, ...DEMO_GAME_IDS.en].map((id) => getDemoGame(id)!.seed);
    expect(new Set(seeds).size).toBe(seeds.length);
  });

  it("picks a bundled demo of the language, avoiding the one just watched", () => {
    for (let i = 0; i < 20; i += 1) {
      expect(DEMO_GAME_IDS.en).toContain(randomDemoId("en"));
      expect(randomDemoId("es", "demo-es-1")).not.toBe("demo-es-1");
    }
  });

  it("only serves the bundled ids", () => {
    expect(isDemoGameId("demo-fr")).toBe(false);
    expect(isDemoGameId("toString")).toBe(false);
    expect(getDemoEvents("g_whatever")).toEqual([]);
  });
});
