import { afterEach, describe, expect, it, vi } from "vitest";
import {
  nativeModelId,
  parseProviderRouting,
  providerOfModel,
  routeForModel,
} from "../../src/lib/codenames/providers";
import { createGame } from "../../src/lib/codenames/engine";
import { spymasterSeat } from "../../src/lib/codenames/seats";
import { buildPublicHistory, viewFor } from "../../src/lib/codenames/view";
import { parseGameConfig } from "../../src/lib/codenames/validation";
import { createModelAgentAdapter } from "../../src/lib/server/codenames/agents";
import { seatsWithoutKey, type ProviderKeys } from "../../src/lib/server/provider-keys";
import type { ModelInfo } from "../../src/lib/types";
import type { GameConfig, Seat, SeatConfig } from "../../src/lib/codenames/types";

function model(id: string, efforts: string[]): ModelInfo {
  return {
    id,
    name: id,
    provider: "test",
    contextLength: 100_000,
    maxOutputTokens: 32_000,
    pricing: { prompt: 0.000001, completion: 0.000005 },
    supportsReasoning: true,
    reasoning: { mandatory: true, efforts: efforts as never },
    supportedParameters: ["tools", "tool_choice", "reasoning"],
    inputModalities: ["text"],
    created: 1,
  };
}

const LUNA = model("openai/gpt-6-luna", ["low", "medium", "high", "xhigh"]);
const SONNET = model("anthropic/claude-sonnet-5.5", ["low", "medium", "high", "xhigh", "max"]);
const DEEPSEEK = model("deepseek/deepseek-v4.1-flash-1017", ["low", "high"]);

describe("provider routing rules", () => {
  it("maps OpenRouter ids to each provider's own id", () => {
    expect(providerOfModel("openai/gpt-6-luna")).toBe("openai");
    expect(providerOfModel("anthropic/claude-opus-5.5")).toBe("anthropic");
    expect(providerOfModel("google/gemini-3-flash")).toBe("google");
    expect(providerOfModel("deepseek/deepseek-v4.1-flash-1017")).toBeNull();
    // Open-weight models under a provider's name are not on its API.
    expect(providerOfModel("openai/gpt-oss-20b")).toBeNull();
    expect(providerOfModel("google/gemma-4-27b-it")).toBeNull();
    expect(nativeModelId("anthropic/claude-sonnet-5.5", "anthropic")).toBe("claude-sonnet-5-5");
    expect(nativeModelId("openai/gpt-6-luna:free", "openai")).toBe("gpt-6-luna");
    expect(nativeModelId("google/gemini-3-flash", "google")).toBe("gemini-3-flash");
  });

  it("goes direct by default when there is a key, and to OpenRouter otherwise or by choice", () => {
    const has = (provider: string) => provider === "openai";
    expect(routeForModel(LUNA.id, undefined, has)).toBe("openai");
    expect(routeForModel(LUNA.id, { openai: "openrouter" }, has)).toBe("openrouter");
    expect(routeForModel(SONNET.id, undefined, has)).toBe("openrouter");
    expect(routeForModel(DEEPSEEK.id, { openai: "direct" }, () => true)).toBe("openrouter");
  });

  it("keeps only valid routing in the game config", () => {
    expect(parseProviderRouting({ openai: "openrouter", anthropic: "nope", mistral: "direct" })).toEqual({
      openai: "openrouter",
    });
    const seat = { modelId: LUNA.id, temperature: 0.5 };
    const seats = { red_spymaster: seat, red_operative: seat, blue_spymaster: seat, blue_operative: seat };
    const parsed = parseGameConfig({ seats, providers: { anthropic: "direct", openai: 3 } });
    if (!parsed.ok) throw new Error(parsed.message);
    expect(parsed.config.providers).toEqual({ anthropic: "direct" });
    const plain = parseGameConfig({ seats });
    expect(plain.ok && plain.config.providers).toBeUndefined();
  });

  it("finds the seats no key can serve", () => {
    const seats = {
      red_spymaster: { modelId: SONNET.id },
      red_operative: { modelId: LUNA.id },
      blue_spymaster: { modelId: DEEPSEEK.id },
      blue_operative: { modelId: DEEPSEEK.id, human: true },
    } as unknown as Record<Seat, SeatConfig>;
    const config = { seats } as GameConfig;
    const keys: ProviderKeys = { openrouter: null, openai: "o", anthropic: "a", google: null };
    expect(seatsWithoutKey(config, keys)).toEqual(["blue_spymaster"]);
    expect(seatsWithoutKey({ ...config, providers: { openai: "openrouter" } }, keys)).toEqual([
      "red_operative",
      "blue_spymaster",
    ]);
    expect(seatsWithoutKey(config, { ...keys, openrouter: "r" })).toEqual([]);
  });
});

function spymasterRequest(modelId: string) {
  const { state, events } = createGame({ id: "p", seed: 7, lang: "en", createdAt: 1 });
  const seat = spymasterSeat(state.turn.team);
  return {
    seat,
    view: viewFor(seat, state, buildPublicHistory(events)),
    config: {
      seat,
      modelId,
      temperature: 0.7,
      avatarId: "zorro",
      displayName: "Fox",
      reasoningEffort: "high",
    } as SeatConfig,
  };
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("direct provider calls", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls OpenAI's Responses API with its model id, effort, auto tool choice and key", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      json({
        status: "completed",
        output: [
          { type: "reasoning", summary: [{ type: "summary_text", text: "Mountains fit two cards." }] },
          { type: "function_call", name: "give_clue", arguments: '{"word":"SUMMIT","number":2}', call_id: "c1" },
        ],
        usage: {
          input_tokens: 1000,
          output_tokens: 100,
          total_tokens: 1100,
          output_tokens_details: { reasoning_tokens: 60 },
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createModelAgentAdapter({
      apiKey: "or-key",
      directKeys: { openai: "openai-key" },
      models: [LUNA],
    });
    const response = await adapter.request(spymasterRequest(LUNA.id));
    expect(response.action).toMatchObject({ type: "give_clue", word: "SUMMIT" });
    expect(response.meta).toMatchObject({
      via: "openai",
      provider: "OpenAI API",
      reasoning: "Mountains fit two cards.",
      reasoningTokens: 60,
    });
    // No cost in the response: estimated from catalog prices.
    expect(response.meta.costUsd).toBeCloseTo(0.0015);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(init.headers.Authorization).toBe("Bearer openai-key");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      model: "gpt-6-luna",
      reasoning: { effort: "high", summary: "auto" },
      tool_choice: "auto",
      parallel_tool_calls: false,
      store: false,
    });
    expect(body.instructions).toContain("SPYMASTER");
    expect(body.tools[0]).toMatchObject({ type: "function", name: "give_clue" });
    expect(body.max_output_tokens).toBeGreaterThan(0);
  });

  it("drops what OpenAI refuses (reasoning summaries, then the parameter named) and tries again", async () => {
    const refusal = (message: string) =>
      new Response(JSON.stringify({ error: { message } }), { status: 400 });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(refusal("Your organization must be verified to generate reasoning summaries."))
      .mockResolvedValueOnce(refusal("Unsupported parameter: 'temperature' is not supported with this model."))
      .mockResolvedValueOnce(
        json({
          status: "incomplete",
          incomplete_details: { reason: "max_output_tokens" },
          output: [{ type: "function_call", name: "give_clue", arguments: '{"word":"PEAK","number":1}' }],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const withTemperature = { ...LUNA, supportedParameters: [...LUNA.supportedParameters, "temperature"] };
    const adapter = createModelAgentAdapter({ apiKey: null, directKeys: { openai: "k" }, models: [withTemperature] });
    const response = await adapter.request(spymasterRequest(LUNA.id));
    expect(response.action).toMatchObject({ type: "give_clue", word: "PEAK" });
    expect(response.meta.finishReason).toBe("length");
    const bodies = fetchMock.mock.calls.map((call) => JSON.parse(call[1].body as string));
    expect(bodies[0].reasoning.summary).toBe("auto");
    expect(bodies[0].temperature).toBe(0.7);
    expect(bodies[1].reasoning.summary).toBeUndefined();
    expect(bodies[2].temperature).toBeUndefined();
    expect(bodies[2].reasoning.effort).toBe("high");
  });

  it("calls the Anthropic Messages API with adaptive thinking and no forced tool", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      json({
        id: "msg_1",
        type: "message",
        role: "assistant",
        model: "claude-sonnet-5-5",
        stop_reason: "tool_use",
        stop_sequence: null,
        content: [
          { type: "thinking", thinking: "Two mountain words.", signature: "sig" },
          { type: "tool_use", id: "tu_1", name: "give_clue", input: { word: "SUMMIT", number: 2 } },
        ],
        usage: {
          input_tokens: 900,
          output_tokens: 200,
          cache_read_input_tokens: 100,
          cache_creation_input_tokens: 0,
          output_tokens_details: { thinking_tokens: 150 },
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createModelAgentAdapter({
      apiKey: "or-key",
      directKeys: { anthropic: "anthropic-key" },
      models: [SONNET],
    });
    const response = await adapter.request(spymasterRequest(SONNET.id));
    expect(response.action).toMatchObject({ type: "give_clue", word: "SUMMIT", number: 2 });
    expect(response.meta).toMatchObject({
      via: "anthropic",
      provider: "Anthropic API",
      reasoning: "Two mountain words.",
      promptTokens: 1000,
      reasoningTokens: 150,
      cachedTokens: 100,
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.anthropic.com/v1/messages");
    // This SDK version sends the key as a bearer token.
    expect(new Headers(init.headers as HeadersInit).get("authorization")).toBe("Bearer anthropic-key");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      model: "claude-sonnet-5-5",
      thinking: { type: "adaptive", display: "summarized" },
      output_config: { effort: "high" },
      tool_choice: { type: "auto", disable_parallel_tool_use: true },
    });
    expect(body.temperature).toBeUndefined();
    expect(body.tools[0]).toMatchObject({ name: "give_clue" });
    expect(body.tools[0].input_schema.properties.word).toBeDefined();
  });

  it("keeps using OpenRouter for providers routed there", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      json({
        choices: [
          {
            finish_reason: "tool_calls",
            message: {
              tool_calls: [
                { type: "function", function: { name: "give_clue", arguments: '{"word":"PEAK","number":1}' } },
              ],
            },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createModelAgentAdapter({
      apiKey: "or-key",
      directKeys: { anthropic: "anthropic-key" },
      routing: { anthropic: "openrouter" },
      models: [SONNET],
    });
    const response = await adapter.request(spymasterRequest(SONNET.id));
    expect(response.meta.via).toBe("openrouter");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(JSON.parse(init.body as string).model).toBe("anthropic/claude-sonnet-5.5");
  });
});
