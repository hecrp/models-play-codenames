import { afterEach, describe, expect, it, vi } from "vitest";
import {
  effortOptions,
  FIRST_ATTEMPT_BUDGET,
  lowerEffort,
  outputBudget,
  resolveEffort,
} from "../../src/lib/codenames/reasoning";
import { extractJsonObject, parseToolCall } from "../../src/lib/codenames/action-parser";
import { createGame } from "../../src/lib/codenames/engine";
import { spymasterSeat } from "../../src/lib/codenames/seats";
import { buildPublicHistory, viewFor } from "../../src/lib/codenames/view";
import { parseGameConfig } from "../../src/lib/codenames/validation";
import { createOpenRouterAgentAdapter } from "../../src/lib/server/codenames/agents";
import type { ModelInfo } from "../../src/lib/types";
import type { SeatConfig } from "../../src/lib/codenames/types";

function model(id: string, reasoning?: ModelInfo["reasoning"], supportsReasoning = true): ModelInfo {
  return {
    id,
    name: id,
    provider: "test",
    contextLength: 100_000,
    maxOutputTokens: 128_000,
    pricing: { prompt: 0.0000001, completion: 0.0000005 },
    supportsReasoning,
    ...(reasoning ? { reasoning } : {}),
    supportedParameters: ["tools", "tool_choice", "reasoning", "temperature"],
    inputModalities: ["text"],
    created: 1,
  };
}

// Shapes taken from the live OpenRouter catalog.
const DEEPSEEK = model("deepseek/deepseek-v4.1-flash-1017", {
  mandatory: false,
  efforts: ["max", "high", "low", "none"],
  defaultEffort: "high",
});
const GLM = model("z-ai/glm-5.3-flash", { mandatory: true, efforts: ["max", "high", "low"] });
const OSS = model("openai/gpt-oss-20b", { mandatory: true, efforts: ["high", "medium", "low"] });
const PLAIN = model("meta-llama/llama-3.1-8b-instruct", undefined, false);

describe("reasoning effort rules", () => {
  it("offers only the levels a model accepts, lowest first, and never none when mandatory", () => {
    expect(effortOptions(DEEPSEEK)).toEqual(["none", "low", "high", "max"]);
    expect(effortOptions(GLM)).toEqual(["low", "high", "max"]);
    expect(effortOptions(PLAIN)).toEqual([]);
    expect(effortOptions(model("x/unknown"))).toEqual(["low", "medium", "high"]);
  });

  it("resolves to the requested level or the closest accepted one", () => {
    expect(resolveEffort(DEEPSEEK, undefined)).toBe("low");
    expect(resolveEffort(DEEPSEEK, "medium")).toBe("low"); // tie between low and high: lower wins
    expect(resolveEffort(DEEPSEEK, "xhigh")).toBe("high");
    expect(resolveEffort(OSS, "none")).toBe("low");
    expect(resolveEffort(PLAIN, "high")).toBeUndefined();
  });

  it("steps down one accepted level and gives every model the same first budget, capped by its limit", () => {
    expect(lowerEffort(DEEPSEEK, "low")).toBe("none");
    expect(lowerEffort(GLM, "low")).toBeUndefined();
    expect(FIRST_ATTEMPT_BUDGET).toBe(32_000);
    expect(outputBudget(DEEPSEEK, "low")).toBe(32_000);
    expect(outputBudget(DEEPSEEK, "high")).toBe(32_000);
    expect(outputBudget(PLAIN, undefined)).toBe(32_000);
    expect(outputBudget({ ...DEEPSEEK, maxOutputTokens: 5000 }, "max")).toBe(5000);
    expect(outputBudget({ ...DEEPSEEK, maxOutputTokens: 0 }, "low")).toBe(32_000);
  });

  it("keeps a valid seat effort in the game config and ignores an invalid one", () => {
    const seat = (effort: unknown) => ({ modelId: "openai/gpt-6-luna", reasoningEffort: effort });
    const parsed = parseGameConfig({
      seats: {
        red_spymaster: seat("high"),
        red_operative: seat("bogus"),
        blue_spymaster: seat(undefined),
        blue_operative: seat("none"),
      },
    });
    if (!parsed.ok) throw new Error(parsed.message);
    expect(parsed.config.seats.red_spymaster.reasoningEffort).toBe("high");
    expect(parsed.config.seats.red_operative.reasoningEffort).toBeUndefined();
    expect(parsed.config.seats.blue_operative.reasoningEffort).toBe("none");
  });
});

describe("rescuing malformed answers seen in real games", () => {
  it("keeps the complete fields of arguments cut off by the token limit", () => {
    const raw =
      '{"word": "Summit", "number": 3, "targets": ["MOUNTAIN", "PYRAMID", "CROWN"], "say": "Three should be reachable.", "reasoning": "';
    const parsed = parseToolCall("give_clue", raw, "en");
    expect(parsed).toMatchObject({
      ok: true,
      salvaged: true,
      action: { type: "give_clue", word: "Summit", number: 3, say: "Three should be reachable." },
    });
  });

  it("survives provider markup leaking into the JSON", () => {
    const raw = '{"say": "Me planto: no arriesgo el turno.", "why"値</｜DSML｜: ';
    expect(parseToolCall("stop", raw)).toMatchObject({
      ok: true,
      action: { type: "stop", say: "Me planto: no arriesgo el turno." },
    });
  });

  it("reads a tool call written as fenced JSON text", () => {
    const content = '```json\n{\n  "word": "PEAK",\n  "number": 3,\n  "say": "Up we go."\n}\n```';
    expect(extractJsonObject(content)).toEqual({ word: "PEAK", number: 3, say: "Up we go." });
  });
});

function completion(message: Record<string, unknown>, finishReason: string) {
  return new Response(
    JSON.stringify({
      choices: [{ finish_reason: finishReason, message }],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150, cost: 0.001 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function clueCall(args: Record<string, unknown>) {
  return { type: "function", function: { name: "give_clue", arguments: JSON.stringify(args) } };
}

function spymasterRequest(config: Partial<SeatConfig> = {}) {
  const { state, events } = createGame({ id: "r", seed: 42, lang: "en", createdAt: 1 });
  const seat = spymasterSeat(state.turn.team);
  return {
    seat,
    view: viewFor(seat, state, buildPublicHistory(events)),
    config: {
      seat,
      modelId: DEEPSEEK.id,
      temperature: 0.7,
      avatarId: "zorro",
      displayName: "Fox",
      ...config,
    } as SeatConfig,
  };
}

function bodyOf(fetchMock: ReturnType<typeof vi.fn>, call: number) {
  return JSON.parse(fetchMock.mock.calls[call][1].body as string);
}

describe("OpenRouter agent adapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const adapter = () => createOpenRouterAgentAdapter({ apiKey: "k", models: [DEEPSEEK] });

  it("sends the seat's effort with the shared budget, default routing and no reasoning argument", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(completion({ tool_calls: [clueCall({ word: "SUMMIT", number: 2 })] }, "tool_calls"));
    vi.stubGlobal("fetch", fetchMock);

    const response = await adapter().request(spymasterRequest({ reasoningEffort: "high" }));
    expect(response.action).toMatchObject({ type: "give_clue", word: "SUMMIT" });
    expect(response.meta).toMatchObject({ reasoningEffort: "high", maxTokens: 32000 });

    const body = bodyOf(fetchMock, 0);
    expect(body.reasoning.effort).toBe("high");
    expect(body.max_tokens).toBe(32000);
    expect(body.provider).toEqual({ require_parameters: true });
    expect(body.tools[0].function.parameters.properties.reasoning).toBeUndefined();
    expect(body.messages[0].content).not.toContain("The reasoning field is optional");
  });

  it("retries a truncated answer once with less reasoning and more room", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(completion({ content: "" }, "length"))
      .mockResolvedValueOnce(completion({ tool_calls: [clueCall({ word: "SUMMIT", number: 2 })] }, "tool_calls"));
    vi.stubGlobal("fetch", fetchMock);

    const response = await adapter().request(spymasterRequest());
    expect(response.action).toMatchObject({ type: "give_clue" });
    expect(response.meta).toMatchObject({ lengthRetry: true, reasoningEffort: "none", maxTokens: 64000 });
    expect(response.meta.costUsd).toBeCloseTo(0.002);
    expect(bodyOf(fetchMock, 0)).toMatchObject({ max_tokens: 32000, reasoning: { effort: "low" } });
    expect(bodyOf(fetchMock, 1)).toMatchObject({ max_tokens: 64000, reasoning: { effort: "none" } });
  });

  it("caps a fixed budget (a study plan's maxTokens) and the retry by the model's output limit", async () => {
    const small = { ...DEEPSEEK, maxOutputTokens: 20_000 };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(completion({ content: "" }, "length"))
      .mockResolvedValueOnce(completion({ tool_calls: [clueCall({ word: "SUMMIT", number: 2 })] }, "tool_calls"))
      .mockResolvedValueOnce(completion({ tool_calls: [clueCall({ word: "SUMMIT", number: 2 })] }, "tool_calls"));
    vi.stubGlobal("fetch", fetchMock);

    const fixed = createOpenRouterAgentAdapter({ apiKey: "k", models: [small], maxTokens: 100_000 });
    const response = await fixed.request(spymasterRequest());
    expect(bodyOf(fetchMock, 0).max_tokens).toBe(20_000);
    expect(bodyOf(fetchMock, 1).max_tokens).toBe(20_000);
    expect(response.meta.maxTokens).toBe(20_000);
    // Without a fixed budget the default is capped the same way.
    await createOpenRouterAgentAdapter({ apiKey: "k", models: [small] }).request(spymasterRequest());
    expect(bodyOf(fetchMock, 2).max_tokens).toBe(20_000);
  });

  it("caps by the pinned endpoint's output limit when it is lower than the model's", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(completion({ tool_calls: [clueCall({ word: "SUMMIT", number: 2 })] }, "tool_calls"));
    vi.stubGlobal("fetch", fetchMock);
    const pinned = createOpenRouterAgentAdapter({
      apiKey: "k",
      models: [DEEPSEEK],
      endpointMaxOutput: { [DEEPSEEK.id]: 16_000 },
    });
    await pinned.request(spymasterRequest());
    expect(bodyOf(fetchMock, 0).max_tokens).toBe(16_000);
  });

  it("accepts the move written as JSON text and identical duplicate calls", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(completion({ content: '```json\n{"word":"PEAK","number":3}\n```' }, "stop"))
      .mockResolvedValueOnce(
        completion(
          { tool_calls: [clueCall({ word: "PEAK", number: 3 }), clueCall({ word: "PEAK", number: 3 })] },
          "tool_calls",
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const text = await adapter().request(spymasterRequest());
    expect(text.action).toMatchObject({ type: "give_clue", word: "PEAK", number: 3 });
    expect(text.meta.recovered).toBe("text");

    const duplicated = await adapter().request(spymasterRequest());
    expect(duplicated.action).toMatchObject({ type: "give_clue", word: "PEAK" });
    expect(duplicated.meta.recovered).toBe("deduped");
  });

  it("relaxes the default routing when no provider supports every parameter", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { message: "No endpoints found that can handle the requested parameters." } }),
          { status: 404, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(completion({ tool_calls: [clueCall({ word: "SUMMIT", number: 2 })] }, "tool_calls"));
    vi.stubGlobal("fetch", fetchMock);

    const response = await adapter().request(spymasterRequest());
    expect(response.action).toMatchObject({ type: "give_clue" });
    expect(bodyOf(fetchMock, 0).provider).toEqual({ require_parameters: true });
    expect(bodyOf(fetchMock, 1).provider).toBeUndefined();
  });
});
