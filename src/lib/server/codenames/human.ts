import { apply, normalizeWord } from "@/lib/codenames/engine";
import { gameText } from "@/lib/codenames/messages";
import type {
  AgentAdapter,
  AgentRequest,
  AgentResponse,
  GameAction,
  GameConfig,
  GameState,
  Language,
  Seat,
  StoredGameEvent,
} from "@/lib/codenames/types";
import type { FunctionTool } from "@/lib/codenames/tools";
import { completeWithTools } from "@/lib/server/openrouter";

interface PendingRequest {
  seat: Seat;
  resolve: (response: AgentResponse) => void;
}

/** Holds the orchestrator's request for the human seat until the UI answers. */
export class HumanInbox {
  private pending: PendingRequest | null = null;

  get waitingSeat(): Seat | null {
    return this.pending?.seat ?? null;
  }

  wait(request: AgentRequest): Promise<AgentResponse> {
    return new Promise((resolve) => {
      const finish = (response: AgentResponse) => {
        if (this.pending?.resolve === finish) this.pending = null;
        request.signal?.removeEventListener("abort", onAbort);
        resolve(response);
      };
      const onAbort = () =>
        finish({
          action: null,
          error: {
            code: "timeout",
            message: gameText(request.view.lang).gameAborted,
            fatal: true,
            aborted: true,
          },
          meta: {},
        });
      if (request.signal?.aborted) {
        onAbort();
        return;
      }
      request.signal?.addEventListener("abort", onAbort, { once: true });
      this.pending = { seat: request.seat, resolve: finish };
    });
  }

  /** Validates against the live state first so a typo never costs an attempt. */
  submit(
    seat: Seat,
    action: GameAction,
    state: GameState,
  ): { ok: true } | { ok: false; message: string } {
    if (!this.pending || this.pending.seat !== seat) {
      return { ok: false, message: gameText(state.lang).notYourTurn };
    }
    const result = apply(state, seat, action);
    if (!result.ok) return { ok: false, message: result.message };
    this.pending.resolve({ action, meta: { modelId: "human" } });
    return { ok: true };
  }
}

export function createMixedAdapter(
  ai: AgentAdapter,
  inbox: HumanInbox,
  seats: GameConfig["seats"],
): AgentAdapter {
  return {
    request: (request) =>
      seats[request.seat].human ? inbox.wait(request) : ai.request(request),
  };
}

export function humanSeat(config: GameConfig): Seat | null {
  return (
    (Object.values(config.seats).find((seat) => seat.human)?.seat as Seat | undefined) ??
    null
  );
}

/** A human operative must not receive hidden colors or the spymasters' private notes. */
export function needsRedaction(config: GameConfig, status: string): boolean {
  const seat = humanSeat(config);
  return (
    seat !== null &&
    seat.endsWith("operative") &&
    status !== "finished" &&
    status !== "aborted"
  );
}

export function redactState(state: GameState): GameState {
  return {
    ...state,
    board: state.board.map((card) =>
      card.revealed ? card : { ...card, color: "neutral" },
    ),
  };
}

export function redactEvent(event: StoredGameEvent): StoredGameEvent {
  const meta = event.meta
    ? { ...event.meta, reasoning: undefined, rawResponse: undefined }
    : undefined;
  if (event.type === "game_started") {
    return {
      ...event,
      meta,
      data: {
        ...event.data,
        board: event.data.board.map((card) => ({ ...card, color: "neutral" })),
      },
    };
  }
  if (event.type === "clue_given") {
    return { ...event, meta, data: { ...event.data, reasoning: undefined } };
  }
  if (event.type === "turn_ended") {
    return { ...event, meta, data: { ...event.data, reasoning: undefined } };
  }
  return { ...event, meta };
}

export const RESOLVER_MODEL_ID =
  process.env.CODENAMES_RESOLVER_MODEL?.trim() || "deepseek/deepseek-v4-flash";

const NONE = "NINGUNA";

export type GuessResolution =
  | { kind: "exact"; word: string }
  | { kind: "suggestion"; word: string }
  | { kind: "unknown" };

/** Case/accent-insensitive match first; only ambiguous text goes to the model. */
export async function resolveGuess(
  text: string,
  hiddenWords: string[],
  apiKey: string | null,
  lang: Language = "es",
  signal?: AbortSignal,
): Promise<GuessResolution> {
  const typed = normalizeWord(text);
  if (!typed) return { kind: "unknown" };
  const exact = hiddenWords.find((word) => normalizeWord(word) === typed);
  if (exact) return { kind: "exact", word: exact };
  if (!apiKey) return { kind: "unknown" };
  const strings = gameText(lang).resolver;

  const tool: FunctionTool = {
    type: "function",
    function: {
      name: "pick_card",
      description: strings.tool,
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["word"],
        properties: {
          word: { type: "string", enum: [...hiddenWords, NONE] },
        },
      },
    },
  };

  try {
    const completion = await completeWithTools({
      apiKey,
      model: RESOLVER_MODEL_ID,
      systemPrompt: strings.system(NONE),
      userPrompt: strings.user(hiddenWords.join(", "), text.slice(0, 60)),
      tools: [tool],
      toolChoice: { type: "function", function: { name: "pick_card" } },
      temperature: 0,
      maxTokens: 200,
      timeoutMs: 15_000,
      maxRetries: 1,
      lang,
      signal,
    });
    const raw = completion.toolCalls[0]?.argumentsRaw;
    const word = raw ? (JSON.parse(raw) as { word?: unknown }).word : undefined;
    const match =
      typeof word === "string"
        ? hiddenWords.find((candidate) => normalizeWord(candidate) === normalizeWord(word))
        : undefined;
    return match ? { kind: "suggestion", word: match } : { kind: "unknown" };
  } catch (error) {
    console.error("[codenames] Could not resolve the typed card:", error);
    return { kind: "unknown" };
  }
}
