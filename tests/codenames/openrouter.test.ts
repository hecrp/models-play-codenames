import { afterEach, describe, expect, it, vi } from "vitest";
import { completeWithTools } from "../../src/lib/server/openrouter";
import { GIVE_CLUE_TOOL } from "../../src/lib/codenames/tools";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("completeWithTools", () => {
  it("retries with tool_choice auto when a 502 says the model did not call a tool", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              message:
                "Upstream error from Groq: Tool choice is required, but model did not call a tool",
              code: 502,
            },
          }),
          { status: 502, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: "tool_calls",
                message: {
                  tool_calls: [
                    {
                      type: "function",
                      function: {
                        name: "give_clue",
                        arguments: '{"word":"PLAN","number":2}',
                      },
                    },
                  ],
                },
              },
            ],
            usage: {
              prompt_tokens: 12,
              completion_tokens: 8,
              total_tokens: 20,
              cost: 0.0001,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await completeWithTools({
      apiKey: "test-key",
      model: "openai/gpt-oss-20b",
      systemPrompt: "system",
      userPrompt: "user",
      tools: [GIVE_CLUE_TOOL],
      toolChoice: { type: "function", function: { name: "give_clue" } },
      includeReasoning: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.toolChoiceFallback).toBe(true);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe("give_clue");
    expect(result.usage?.totalTokens).toBe(20);

    const secondCall = fetchMock.mock.calls[1] as [
      string,
      { body: string },
    ];
    const body = JSON.parse(secondCall[1].body) as Record<string, unknown>;
    expect(body.tool_choice).toBe("auto");
    expect(body.max_tokens).toBe(2000);
    expect(body.reasoning).toMatchObject({ effort: "low", exclude: false });
  });

  it("does not fall back to auto on a non tool-choice 502", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: { message: "Upstream provider exploded" } }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      completeWithTools({
        apiKey: "test-key",
        model: "openai/gpt-oss-20b",
        systemPrompt: "system",
        userPrompt: "user",
        tools: [GIVE_CLUE_TOOL],
        toolChoice: "required",
        maxRetries: 0,
      }),
    ).rejects.toThrow(/OpenRouter/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("backs off and retries a 429 honoring Retry-After", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "Rate limit exceeded" } }), {
          status: 429,
          headers: { "Content-Type": "application/json", "Retry-After": "0" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  tool_calls: [
                    {
                      type: "function",
                      function: { name: "give_clue", arguments: '{"word":"PLAN","number":1}' },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await completeWithTools({
      apiKey: "test-key",
      model: "openai/gpt-oss-20b",
      systemPrompt: "system",
      userPrompt: "user",
      tools: [GIVE_CLUE_TOOL],
      toolChoice: "required",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.toolChoiceFallback).toBe(false);
    expect(result.toolCalls[0].name).toBe("give_clue");
  });

  it("fails clearly without an API key", async () => {
    delete process.env.OPENROUTER_API_KEY;
    await expect(
      completeWithTools({
        apiKey: "",
        model: "openai/gpt-oss-20b",
        systemPrompt: "system",
        userPrompt: "user",
        tools: [GIVE_CLUE_TOOL],
        toolChoice: "required",
      }),
    ).rejects.toThrow(/API key/);
  });
});
