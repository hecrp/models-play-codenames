import { afterEach, describe, expect, it, vi } from "vitest";
import { createGame } from "../../src/lib/codenames/engine";
import { operativeSeat, roleOfSeat, SEATS, spymasterSeat } from "../../src/lib/codenames/seats";
import { toolChoiceForSeat } from "../../src/lib/codenames/tools";
import { buildPublicHistory, viewFor } from "../../src/lib/codenames/view";
import { createModelAgentAdapter } from "../../src/lib/server/codenames/agents";
import { GameOrchestrator } from "../../src/lib/server/codenames/orchestrator";
import type { AgentAdapter, AgentRequest, AgentResponse, GameAction, Seat, SeatConfig } from "../../src/lib/codenames/types";
import type { ModelInfo } from "../../src/lib/types";
import { safeClue } from "./helpers";

const MODEL: ModelInfo = {
  id: "test/model",
  name: "Test",
  provider: "test",
  contextLength: 100_000,
  maxOutputTokens: 32_000,
  pricing: { prompt: 0.000001, completion: 0.000005 },
  supportsReasoning: false,
  supportedParameters: ["tools", "tool_choice"],
  inputModalities: ["text"],
  created: 1,
};

function seatConfig(seat: Seat): SeatConfig {
  return { seat, modelId: MODEL.id, temperature: null, avatarId: "zorro", displayName: seat };
}

function completion(message: Record<string, unknown>) {
  return new Response(
    JSON.stringify({ provider: "Test", choices: [{ message, finish_reason: message.tool_calls ? "tool_calls" : "stop" }] }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function toolCall(name: string, args: Record<string, unknown>) {
  return { tool_calls: [{ id: "c", type: "function", function: { name, arguments: JSON.stringify(args) } }] };
}

describe("tool_choice", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is auto for every seat", () => {
    for (const seat of SEATS) expect(toolChoiceForSeat(seat)).toBe("auto");
  });

  it("the adapter sends auto to spymaster and operative and records it in the meta", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const { state, events } = createGame({ id: "tc", seed: 4, createdAt: 1 });
    const team = state.turn.team;
    const card = state.board.find((candidate) => !candidate.revealed)!.word;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        const body = JSON.parse(init.body);
        bodies.push(body);
        const isClue = body.tools.some((tool: { function: { name: string } }) => tool.function.name === "give_clue");
        return completion(
          isClue
            ? toolCall("give_clue", { word: safeClue(state), number: 1, targets: [], say: "Vamos." })
            : toolCall("guess", { word: card, say: "Esta." }),
        );
      }),
    );
    const adapter = createModelAgentAdapter({ apiKey: "k", models: [MODEL] });
    const ask = (seat: Seat) =>
      adapter.request({ seat, view: viewFor(seat, state, buildPublicHistory(events), events), config: seatConfig(seat) });

    const clue = await ask(spymasterSeat(team));
    const guess = await ask(operativeSeat(team));
    expect(bodies.map((body) => body.tool_choice)).toEqual(["auto", "auto"]);
    // The model does not declare parallel_tool_calls: it is not sent.
    expect(bodies.every((body) => !("parallel_tool_calls" in body))).toBe(true);
    for (const response of [clue, guess]) {
      expect(response.meta).toMatchObject({ toolChoice: "auto", toolChoiceFallback: false });
      expect(response.meta.parallelToolCalls).toBeUndefined();
    }

    // An endpoint that declares it gets parallel calls disabled.
    const declaring = createModelAgentAdapter({
      apiKey: "k",
      models: [MODEL],
      endpointParameters: { [MODEL.id]: ["tools", "tool_choice", "parallel_tool_calls"] },
    });
    const seat = spymasterSeat(team);
    const disabled = await declaring.request({ seat, view: viewFor(seat, state, [], events), config: seatConfig(seat) });
    expect(bodies.at(-1)?.parallel_tool_calls).toBe(false);
    expect(disabled.meta.parallelToolCalls).toBe(false);
  });

  it("an answer without a tool call is a private no_tool_call, never part of the public history", async () => {
    const secretText = "Pienso en la pista LUNA porque une tres de mis cartas";
    let spymasterCalls = 0;
    const prompts: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        const body = JSON.parse(init.body);
        prompts.push(body.messages[1].content);
        spymasterCalls += 1;
        // First answer: plain text, no tool call and no JSON to rescue.
        return spymasterCalls === 1
          ? completion({ content: secretText })
          : completion(toolCall("give_clue", { word: "OCEANO", number: 1, targets: [], say: "Ahí va." }));
      }),
    );
    const model = createModelAgentAdapter({ apiKey: "k", models: [MODEL] });
    const requests: AgentRequest[] = [];
    let modelCalls = 0;
    // The first spymaster move goes through the real adapter; the rest of the game is scripted.
    const adapter: AgentAdapter = {
      request: async (request: AgentRequest): Promise<AgentResponse> => {
        requests.push(request);
        if (roleOfSeat(request.seat) === "spymaster" && modelCalls < 2) {
          modelCalls += 1;
          return model.request(request);
        }
        const action: GameAction =
          roleOfSeat(request.seat) === "spymaster"
            ? { type: "give_clue", word: safeClue(game.state), number: 1, targets: [] }
            : request.view.turn.guessesMade > 0
              ? { type: "stop" }
              : { type: "guess", word: request.view.board.find((card) => !card.revealed)!.word };
        return { action, meta: { modelId: MODEL.id } };
      },
    };
    const game: GameOrchestrator = new GameOrchestrator({
      gameId: "no-tool",
      seed: 12,
      seats: Object.fromEntries(SEATS.map((seat) => [seat, seatConfig(seat)])) as Record<Seat, SeatConfig>,
      adapter,
      baseDelayMs: 0,
      sleep: async () => {},
    });
    await game.run();

    const error = game.events.find((event) => event.type === "agent_error");
    expect(error && error.type === "agent_error" ? error.data.code : null).toBe("no_tool_call");
    expect(error && error.type === "agent_error" ? error.data.transient : null).toBeUndefined();
    // The seat got the reason back privately on its next attempt…
    const retry = requests.filter((request) => request.seat === error!.seat)[1];
    expect(retry.feedback).toBeTruthy();
    expect(prompts[1]).toContain(retry.feedback!);
    // …but the text never reaches the public history nor any other seat.
    const history = buildPublicHistory(game.events).join("\n");
    expect(history).not.toContain(secretText);
    expect(history).not.toContain(retry.feedback!);
    for (const request of requests) {
      expect(JSON.stringify(request.view)).not.toContain(secretText);
      if (request !== retry) expect(request.feedback ?? "").not.toContain(secretText.slice(0, 40));
    }
    expect(game.events.some((event) => event.type === "clue_given")).toBe(true);
  });
});
