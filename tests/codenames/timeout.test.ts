import { afterEach, describe, expect, it, vi } from "vitest";
import { completeWithTools, OpenRouterError, postWithDeadline } from "../../src/lib/server/openrouter";
import { completeWithOpenAIResponses } from "../../src/lib/server/openai-responses";

/**
 * Like OpenRouter on a non-streaming completion: the headers come at once and
 * the body only when generation ends. Aborting the request's signal errors
 * the body, as real fetch does.
 */
function lateBody(delayMs: number, body: string, signal?: AbortSignal | null): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const timer = setTimeout(() => {
        controller.enqueue(new TextEncoder().encode(body));
        controller.close();
      }, delayMs);
      signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        controller.error(new DOMException("The operation was aborted.", "AbortError"));
      });
    },
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "application/json" } });
}

const COMPLETION = JSON.stringify({
  provider: "Test",
  choices: [
    {
      message: { tool_calls: [{ id: "c", type: "function", function: { name: "stop", arguments: "{}" } }] },
      finish_reason: "tool_calls",
    },
  ],
});

function stubLateFetch(delayMs: number, body = COMPLETION) {
  const fetchMock = vi.fn(async (_url: string, init: { signal?: AbortSignal }) => lateBody(delayMs, body, init.signal));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const request = { headers: { "Content-Type": "application/json" }, body: "{}" };

describe("call deadline", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("covers the body: a generation that outlasts the timeout fails even though the headers came at once", async () => {
    stubLateFetch(300);
    const started = Date.now();
    const error = await postWithDeadline("https://x.test", request, { timeoutMs: 40 }).catch((caught) => caught);
    expect(error).toBeInstanceOf(OpenRouterError);
    expect(error).toMatchObject({ status: 0, retryable: false });
    expect(error.aborted).toBeFalsy();
    expect(Date.now() - started).toBeLessThan(250);
  });

  it("returns the body and its full latency when it arrives in time", async () => {
    stubLateFetch(30, '{"ok":true}');
    const result = await postWithDeadline("https://x.test", request, { timeoutMs: 1000 });
    expect(result.text).toBe('{"ok":true}');
    expect(result.latencyMs).toBeGreaterThanOrEqual(25);
  });

  it("is cancelled by the caller's signal while the body is still coming", async () => {
    stubLateFetch(300);
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 20);
    const error = await postWithDeadline("https://x.test", request, { timeoutMs: 5000, signal: controller.signal }).catch(
      (caught) => caught,
    );
    expect(error).toMatchObject({ status: 0, aborted: true });
  });

  it("applies to OpenRouter completions: a timeout is not retried by the backoff loop", async () => {
    const fetchMock = stubLateFetch(300);
    const error = await completeWithTools({
      apiKey: "k",
      model: "test/model",
      systemPrompt: "s",
      userPrompt: "u",
      tools: [],
      toolChoice: "auto",
      timeoutMs: 40,
    }).catch((caught) => caught);
    expect(error).toMatchObject({ status: 0, retryable: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    stubLateFetch(10);
    const ok = await completeWithTools({
      apiKey: "k",
      model: "test/model",
      systemPrompt: "s",
      userPrompt: "u",
      tools: [],
      toolChoice: "auto",
      timeoutMs: 1000,
    });
    expect(ok.toolCalls[0].name).toBe("stop");
  });

  it("applies to OpenAI's Responses API too", async () => {
    stubLateFetch(300, JSON.stringify({ status: "completed", output: [] }));
    const error = await completeWithOpenAIResponses({
      apiKey: "k",
      model: "gpt-x",
      systemPrompt: "s",
      userPrompt: "u",
      tools: [],
      toolChoice: "auto",
      timeoutMs: 40,
    }).catch((caught) => caught);
    expect(error).toMatchObject({ status: 0, retryable: false });
  });
});
