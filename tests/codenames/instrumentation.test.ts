import { afterEach, describe, expect, it, vi } from "vitest";
import { parseToolCall } from "../../src/lib/codenames/action-parser";
import { apply } from "../../src/lib/codenames/engine";
import { spymasterSeat, operativeSeat } from "../../src/lib/codenames/seats";
import { toolsForSeat } from "../../src/lib/codenames/tools";
import { viewFor } from "../../src/lib/codenames/view";
import { redactEvent } from "../../src/lib/server/codenames/human";
import { completeWithTools, mapUsage } from "../../src/lib/server/openrouter";
import type { StoredGameEvent } from "../../src/lib/codenames/types";
import { cardOfColor, newGame, ok, safeClue } from "./helpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("clue targets", () => {
  it("keeps declared targets that are unrevealed board words and counts the rest", () => {
    const state = newGame();
    const team = state.turn.team;
    const own = state.board.filter((card) => card.color === team);
    const result = ok(
      apply(state, spymasterSeat(team), {
        type: "give_clue",
        word: safeClue(state),
        number: 2,
        targets: [own[0].word.toLowerCase(), own[1].word, own[1].word, "NOPE"],
      }),
    );
    const event = result.events[0];
    expect(event.type).toBe("clue_given");
    if (event.type !== "clue_given") return;
    expect(event.data.targets).toEqual([own[0].word, own[1].word]);
    expect(event.data.targetsDropped).toBe(1);
    // Targets never reach the game state (and so never a later prompt).
    expect(JSON.stringify(result.state)).not.toContain("targets");
  });

  it("are redacted when a person plays", () => {
    const event = {
      id: 1,
      at: 0,
      type: "clue_given",
      seat: "red_spymaster",
      data: { word: "MAR", number: 2, targets: ["OLA"], targetsDropped: 1, reasoning: "x" },
    } as StoredGameEvent;
    const redacted = redactEvent(event);
    if (redacted.type !== "clue_given") throw new Error("type changed");
    expect(redacted.data.targets).toBeUndefined();
    expect(redacted.data.targetsDropped).toBeUndefined();
    expect(redacted.data.reasoning).toBeUndefined();
  });

  it("are parsed from an array or a comma-separated string", () => {
    const fromArray = parseToolCall("give_clue", '{"word":"MAR","number":2,"targets":["OLA"," PEZ "]}');
    const fromString = parseToolCall("give_clue", '{"word":"MAR","number":2,"objetivos":"OLA, PEZ"}');
    const missing = parseToolCall("give_clue", '{"word":"MAR","number":2}');
    for (const parsed of [fromArray, fromString]) {
      expect(parsed.ok && parsed.action.type === "give_clue" && parsed.action.targets).toEqual(["OLA", "PEZ"]);
    }
    expect(missing.ok && missing.action.type === "give_clue" && missing.action.targets).toBeUndefined();
  });

  it("are offered to the spymaster as an enum of its own unrevealed words", () => {
    const state = newGame();
    const seat = spymasterSeat(state.turn.team);
    const view = viewFor(seat, state);
    const [tool] = toolsForSeat(seat, view);
    const parameters = tool.function.parameters as {
      required: string[];
      properties: { targets: { items: { enum: string[] } } };
    };
    expect(parameters.required).toContain("targets");
    expect(parameters.properties.targets.items.enum).toEqual(view.ownWords);
  });
});

describe("table talk masking", () => {
  it("counts hidden words masked out of say", () => {
    const state = newGame();
    const team = state.turn.team;
    const rival = cardOfColor(state, team === "red" ? "blue" : "red");
    const result = ok(
      apply(state, spymasterSeat(team), {
        type: "give_clue",
        word: safeClue(state),
        number: 1,
        say: `I would never say ${rival.word}`,
      }),
    );
    const event = result.events[0];
    if (event.type !== "clue_given") throw new Error("expected a clue");
    expect(event.data.say).toBe("I would never say …");
    expect(event.data.sayMasked).toBe(1);

    const guess = ok(
      apply(result.state, operativeSeat(team), {
        type: "guess",
        word: cardOfColor(result.state, team).word,
        say: "Clean line",
      }),
    );
    const guessEvent = guess.events[0];
    if (guessEvent.type !== "guess_made") throw new Error("expected a guess");
    expect(guessEvent.data.sayMasked).toBeUndefined();
  });
});

describe("OpenRouter usage details", () => {
  it("maps reasoning and cached tokens", () => {
    expect(
      mapUsage({
        prompt_tokens: 100,
        completion_tokens: 50,
        completion_tokens_details: { reasoning_tokens: 30 },
        prompt_tokens_details: { cached_tokens: 64 },
      }),
    ).toMatchObject({ promptTokens: 100, completionTokens: 50, reasoningTokens: 30, cachedTokens: 64 });
  });

  it("reports the provider, retries and forwards provider routing", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            provider: "DeepInfra",
            choices: [
              {
                finish_reason: "tool_calls",
                message: {
                  tool_calls: [{ type: "function", function: { name: "stop", arguments: "{}" } }],
                },
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 500 });
    try {
      const result = await completeWithTools({
        apiKey: "test-key",
        model: "openai/gpt-oss-20b",
        systemPrompt: "system",
        userPrompt: "user",
        tools: [],
        toolChoice: "required",
        provider: { order: ["DeepInfra"], allow_fallbacks: false },
      });
      expect(result.provider).toBe("DeepInfra");
      expect(result.retries).toBe(1);
      const body = JSON.parse(fetchMock.mock.calls[1][1].body as string);
      expect(body.provider).toEqual({ order: ["DeepInfra"], allow_fallbacks: false });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("tool names", () => {
  it("accepts the functions. namespace some models prepend", () => {
    const parsed = parseToolCall("functions.give_clue", '{"word":"MAR","number":1,"targets":["OLA"]}');
    expect(parsed.ok && parsed.action.type).toBe("give_clue");
  });
});
