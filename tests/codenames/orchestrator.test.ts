import { describe, expect, it } from "vitest";
import { createGame, normalizeWord } from "../../src/lib/codenames/engine";
import { roleOfSeat } from "../../src/lib/codenames/seats";
import { ES_WORDS } from "../../src/lib/codenames/words/es";
import { GameOrchestrator } from "../../src/lib/server/codenames/orchestrator";
import type {
  AgentAdapter,
  AgentRequest,
  AgentResponse,
  GameAction,
  Seat,
  SeatConfig,
} from "../../src/lib/codenames/types";

function seats(): Record<Seat, SeatConfig> {
  const ids: Seat[] = [
    "red_spymaster",
    "red_operative",
    "blue_spymaster",
    "blue_operative",
  ];
  return Object.fromEntries(
    ids.map((seat) => [
      seat,
      {
        seat,
        modelId: "fake/model",
        temperature: seat.endsWith("spymaster") ? 0.7 : 0.3,
        avatarId: "zorro",
        displayName: seat,
      },
    ]),
  ) as Record<Seat, SeatConfig>;
}

function safeClue(values: string[]): string {
  const hidden = values.map(normalizeWord);
  for (const word of ES_WORDS) {
    const normalized = normalizeWord(word);
    if (
      !hidden.some(
        (value) =>
          value === normalized ||
          value.includes(normalized) ||
          normalized.includes(value),
      )
    ) {
      return word;
    }
  }
  throw new Error("Sin pista segura");
}

// Same seed as createOrchestrator, so the test can peek at hidden colors.
const BOARD = createGame({ id: "peek", seed: 12 }).state.board;

function playAction(request: AgentRequest): GameAction {
  if (roleOfSeat(request.seat) === "spymaster") {
    return {
      type: "give_clue",
      word: safeClue(request.view.board.map((card) => card.word)),
      number: 1,
    };
  }
  if (request.view.turn.guessesMade > 0) {
    return { type: "stop", reasoning: "Fin del turno falso." };
  }
  // Prefer a card that ends the turn so each turn is a single operative call.
  const team = request.view.team;
  const hidden = request.view.board.filter((card) => !card.revealed);
  const colorOf = (word: string) => BOARD.find((card) => card.word === word)?.color;
  const pick =
    hidden.find((card) => colorOf(card.word) === "neutral") ??
    hidden.find((card) => colorOf(card.word) !== team && colorOf(card.word) !== "assassin") ??
    hidden[0];
  return { type: "guess", word: pick.word };
}

function adapterFrom(
  handler: (request: AgentRequest) => Promise<AgentResponse> | AgentResponse,
): AgentAdapter {
  return { request: async (request) => handler(request) };
}

function response(action: GameAction | null, extra: Partial<AgentResponse> = {}) {
  return {
    action,
    meta: { modelId: "fake/model", promptVersion: "test", costUsd: 0 },
    ...extra,
  } satisfies AgentResponse;
}

function createOrchestrator(
  adapter: AgentAdapter,
  options: { maxCostUsd?: number | null; baseDelayMs?: number } = {},
) {
  return new GameOrchestrator({
    gameId: "orchestrator-test",
    seed: 12,
    seats: seats(),
    adapter,
    baseDelayMs: options.baseDelayMs ?? 0,
    maxCostUsd: options.maxCostUsd ?? null,
    sleep: async () => {},
    now: () => 1_700_000_000_000,
  });
}

async function waitUntil(predicate: () => boolean, timeoutMs = 2_000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error("Timed out waiting for orchestrator state.");
    }
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}

describe("GameOrchestrator", () => {
  it("plays a complete game and emits sequential events", async () => {
    const adapter = adapterFrom((request) => response(playAction(request)));
    const game = createOrchestrator(adapter);
    const state = await game.run();

    expect(state.status).toBe("finished");
    expect(game.events[0].type).toBe("game_started");
    expect(game.events.at(-1)?.type).toBe("game_over");
    game.events.forEach((event, index) => {
      expect(event.id).toBe(index + 1);
      expect(typeof event.at).toBe("number");
    });
    expect(game.events.some((event) => event.type === "thinking")).toBe(true);
    expect(game.events.some((event) => event.type === "clue_given")).toBe(true);
  });

  it("retries an illegal clue and reports attempts left", async () => {
    let spymasterCalls = 0;
    const adapter = adapterFrom((request) => {
      if (roleOfSeat(request.seat) === "spymaster") {
        spymasterCalls += 1;
        if (spymasterCalls <= 2) {
          return response(
            {
              type: "give_clue",
              word: request.view.board[0].word,
              number: 2,
            },
            { meta: { modelId: "fake/model", promptVersion: "test", costUsd: 0 } },
          );
        }
        return response(playAction(request));
      }
      return response(playAction(request));
    });
    const game = createOrchestrator(adapter, { maxCostUsd: 0 });
    await game.run();

    const errors = game.events.filter((event) => event.type === "agent_error");
    expect(errors.length).toBe(2);
    const left = errors.map((event) =>
      event.type === "agent_error" ? event.data.attemptsLeft : -1,
    );
    expect(left).toEqual([2, 1]);
    expect(game.events.some((event) => event.type === "clue_given")).toBe(true);
    expect(game.events.at(-1)?.type).toBe("game_over");
  });

  it("forfeits the turn after three illegal clues", async () => {
    const clueOnly = adapterFrom((request) =>
      response({
        type: "give_clue",
        word: request.view.board[0].word,
        number: 2,
      }),
    );
    const game = createOrchestrator(clueOnly);
    await game.run();

    const ended = game.events.filter(
      (event) =>
        event.type === "turn_ended" && event.data.reason === "clue_failed",
    );
    expect(ended.length).toBe(40);
    const lastEvent = game.events.at(-1);
    expect(lastEvent?.type).toBe("game_over");
    if (lastEvent?.type === "game_over") {
      expect(lastEvent.data.reason).toBe("turn_limit");
    }
  });

  it("aborts automatically when the cost limit is reached", async () => {
    let calls = 0;
    const adapter = adapterFrom((request) => {
      calls += 1;
      return response(playAction(request), {
        meta: { modelId: "fake/model", promptVersion: "test", costUsd: 0.6 },
      });
    });
    const game = createOrchestrator(adapter, { maxCostUsd: 0.5 });
    await game.run();

    expect(calls).toBe(1);
    const lastEvent = game.events.at(-1);
    expect(lastEvent?.type).toBe("game_over");
    if (lastEvent?.type === "game_over") {
      expect(lastEvent.data.reason).toBe("cost_limit");
    }
  });

  it("supports pause and step", async () => {
    const releases: Array<() => void> = [];
    let calls = 0;
    const adapter = adapterFrom(async (request) => {
      calls += 1;
      await new Promise<void>((resolve) => {
        releases.push(resolve);
      });
      return response(playAction(request));
    });
    const game = createOrchestrator(adapter);
    const running = game.run();

    await waitUntil(() => calls === 1 && releases.length === 1);
    await game.pause();
    releases.shift()?.();
    await waitUntil(() =>
      game.events.some((event) => event.type === "game_paused"),
    );
    const callsWhilePaused = calls;
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(calls).toBe(callsWhilePaused);

    await game.step();
    await waitUntil(() => calls === callsWhilePaused + 1);
    releases.shift()?.();
    await waitUntil(() =>
      game.events.some((event) => event.type === "turn_ended"),
    );

    game.abort();
    while (releases.length > 0) releases.shift()?.();
    await running;
    expect(game.events.at(-1)?.type).toBe("game_over");
  });

  it("pauses on a fatal model error and can resume", async () => {
    let failed = false;
    const adapter = adapterFrom((request) => {
      if (!failed) {
        failed = true;
        return response(null, {
          error: {
            code: "invalid_action",
            message: "Sin saldo.",
            fatal: true,
          },
        });
      }
      return response(playAction(request));
    });
    const game = createOrchestrator(adapter);
    const running = game.run();

    await waitUntil(() =>
      game.events.some(
        (event) =>
          event.type === "game_paused" && event.data.reason === "error",
      ),
    );
    expect(game.paused).toBe(true);
    expect(game.fatalError).toBe("Sin saldo.");
    game.abort();
    await running;
    expect(game.events.at(-1)?.type).toBe("game_over");
  });

  it("aborts while a model call is in flight", async () => {
    const releases: Array<() => void> = [];
    const adapter = adapterFrom(async (request) => {
      await new Promise<void>((resolve) => {
        releases.push(resolve);
      });
      return response(playAction(request));
    });
    const game = createOrchestrator(adapter);
    const running = game.run();
    await waitUntil(() => releases.length === 1);
    game.abort();
    releases.shift()?.();
    const state = await running;

    expect(state.status).toBe("aborted");
    const lastEvent = game.events.at(-1);
    expect(lastEvent?.type).toBe("game_over");
    if (lastEvent?.type === "game_over") {
      expect(lastEvent.data.reason).toBe("aborted");
    }
  });

  it("continues from a persisted state and event log", async () => {
    const created = createGame({ id: "recovery", seed: 12, createdAt: 1_700_000_000_000 });
    const initialEvents = created.events.map((event, index) => ({
      ...event,
      id: index + 1,
      at: 1_700_000_000_000 + index,
    }));
    const emitted: number[] = [];
    const adapter = adapterFrom((request) => response(playAction(request)));
    const game = new GameOrchestrator({
      gameId: "recovery",
      seed: 12,
      seats: seats(),
      adapter,
      initialState: created.state,
      initialEvents,
      baseDelayMs: 0,
      sleep: async () => {},
      hooks: {
        onEvent: (event) => {
          emitted.push(event.id);
        },
      },
    });

    const state = await game.run();
    expect(state.status).toBe("finished");
    expect(game.events[0].id).toBe(1);
    expect(game.events[1].id).toBe(2);
    expect(new Set(game.events.map((event) => event.id)).size).toBe(
      game.events.length,
    );
    expect(game.events[2].id).toBe(3);
    expect(emitted).not.toContain(1);
    expect(emitted).not.toContain(2);
    expect(Math.min(...emitted)).toBeGreaterThanOrEqual(3);
  });
});
