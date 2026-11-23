import { afterEach, describe, expect, it, vi } from "vitest";
import { botCardOrder, botTurn, createGame, MAX_TURNS, remainingCards } from "../../src/lib/codenames/engine";
import { buildAgentPrompt, promptVersionFor } from "../../src/lib/codenames/prompts";
import { operativeSeat, roleOfSeat, SEATS, spymasterSeat } from "../../src/lib/codenames/seats";
import { buildPublicHistory, viewFor } from "../../src/lib/codenames/view";
import { createModelAgentAdapter } from "../../src/lib/server/codenames/agents";
import { GameOrchestrator } from "../../src/lib/server/codenames/orchestrator";
import type { AgentRequest, AgentResponse, GameAction, GameState, Seat, SeatConfig, Team } from "../../src/lib/codenames/types";
import type { ModelInfo } from "../../src/lib/types";
import { safeClue } from "./helpers";

/** Model id given to the automaton's seats (the orchestrator never calls them). */
const BOT = "bot";

/** A state where `team` is about to play its clue phase. */
function stateFor(team: Team, seed = 9): GameState {
  const { state } = createGame({ id: "bot", seed, createdAt: 1 });
  return { ...state, turn: { ...state.turn, team } };
}

describe("automaton turn (engine)", () => {
  it("reveals exactly `pace` of its own cards in a fixed order, then passes", () => {
    const state = stateFor("blue");
    const order = botCardOrder(state, "blue");
    expect(order).toEqual(botCardOrder(stateFor("blue"), "blue"));
    expect(new Set(order)).toEqual(new Set(state.board.filter((card) => card.color === "blue").map((card) => card.word)));

    const { state: next, events } = botTurn(state, 2);
    const guesses = events.filter((event) => event.type === "guess_made");
    expect(guesses.map((event) => (event.type === "guess_made" ? event.data.word : ""))).toEqual(order.slice(0, 2));
    expect(guesses.every((event) => event.type === "guess_made" && event.data.result === "own" && event.seat === operativeSeat("blue"))).toBe(true);
    expect(events.some((event) => event.type === "clue_given")).toBe(false);
    const ended = events.find((event) => event.type === "turn_ended");
    expect(ended?.type === "turn_ended" && ended.data.reason).toBe("bot_turn");
    expect(next.turn.team).toBe("red");
    expect(next.turnsPlayed).toBe(state.turnsPlayed + 1);
    expect(remainingCards(next).blue).toBe(remainingCards(state).blue - 2);
  });

  it("skips cards already revealed and wins when it reveals its last one", () => {
    const state = stateFor("red");
    const order = botCardOrder(state, "red");
    const almost = {
      ...state,
      board: state.board.map((card) => (card.color === "red" && card.word !== order.at(-1) ? { ...card, revealed: true } : card)),
    };
    const { state: next, events } = botTurn(almost, 2);
    expect(events.filter((event) => event.type === "guess_made")).toHaveLength(1);
    expect(next.status).toBe("finished");
    expect(next.winner).toBe("red");
    expect(next.winReason).toBe("all_cards");
  });

  it("respects the turn limit", () => {
    const state = { ...stateFor("blue"), turnsPlayed: MAX_TURNS };
    const { state: next } = botTurn(state, 1);
    expect(next.status).toBe("finished");
    expect(next.winReason).toBe("turn_limit");
  });
});

describe("bot mode through the orchestrator", () => {
  afterEach(() => vi.unstubAllGlobals());

  async function play(botTeam: Team, pace: number) {
    const requests: AgentRequest[] = [];
    const seats = Object.fromEntries(
      SEATS.map((seat) => [seat, { seat, modelId: seat.startsWith(botTeam) ? BOT : "ai/model", temperature: null, avatarId: "zorro", displayName: seat } satisfies SeatConfig]),
    ) as Record<Seat, SeatConfig>;
    const game: GameOrchestrator = new GameOrchestrator({
      gameId: "bot-game",
      seed: 17,
      seats,
      bot: { team: botTeam, pace },
      baseDelayMs: 0,
      sleep: async () => {},
      adapter: {
        request: async (request): Promise<AgentResponse> => {
          requests.push(request);
          let action: GameAction;
          if (roleOfSeat(request.seat) === "spymaster") {
            action = { type: "give_clue", word: safeClue(game.state, 1), number: 1, targets: request.view.ownWords!.slice(0, 1) };
          } else if (request.view.turn.guessesMade > 0) {
            action = { type: "stop" };
          } else {
            // A careful operative: always one of its own cards (peeking through the test's state).
            const own = game.state.board.find((card) => !card.revealed && card.color === request.view.team)!;
            action = { type: "guess", word: own.word };
          }
          return { action, meta: { modelId: "ai/model" } };
        },
      },
    });
    const state = await game.run();
    return { state, events: game.events, requests };
  }

  it("never asks a model for the automaton's seats and records its turns as bot_turn", async () => {
    const { state, events, requests } = await play("blue", 2);
    expect(state.status).toBe("finished");
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every((request) => request.seat.startsWith("red"))).toBe(true);
    expect(events.some((event) => event.type === "clue_given" && event.seat.startsWith("blue"))).toBe(false);
    expect(events.some((event) => event.type === "turn_ended" && event.data.reason === "bot_turn")).toBe(true);
    // The automaton's events carry no model meta: nothing was called.
    expect(events.filter((event) => "seat" in event && event.seat?.startsWith("blue") && event.meta).length).toBe(0);
  });

  it("shows the AI the automaton in the public history", async () => {
    const { requests } = await play("red", 1);
    const later = requests.find((request) => request.view.history.some((line) => line.startsWith("Autómata")));
    expect(later).toBeTruthy();
    expect(later!.view.history.join("\n")).toContain("Fin del turno: el autómata pasa.");
  });

  it("the adapter tells the AI its rival is an automaton and records the version", async () => {
    const bodies: Array<Record<string, any>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        bodies.push(JSON.parse(init.body));
        const call = { id: "c", type: "function", function: { name: "give_clue", arguments: '{"word":"OCEANO","number":1,"targets":[]}' } };
        return new Response(JSON.stringify({ choices: [{ message: { tool_calls: [call] }, finish_reason: "tool_calls" }] }), { status: 200 });
      }),
    );
    const model: ModelInfo = {
      id: "ai/model", name: "AI", provider: "t", contextLength: 1e5, maxOutputTokens: 1e5,
      pricing: { prompt: 1e-6, completion: 1e-6 }, supportsReasoning: false, supportedParameters: ["tools", "tool_choice"],
      inputModalities: ["text"], created: 1,
    };
    const { state, events } = createGame({ id: "p", seed: 4, createdAt: 1 });
    const seat = spymasterSeat(state.turn.team);
    const response = await createModelAgentAdapter({ apiKey: "k", models: [model], botPace: 2 }).request({
      seat,
      view: viewFor(seat, state, buildPublicHistory(events), events),
      config: { seat, modelId: model.id, temperature: null, avatarId: "zorro", displayName: "x" },
    });
    expect(response.meta.promptVersion).toBe(promptVersionFor("full", 2));
    expect(promptVersionFor("full", 2)).toMatch(/-bot2$/);
    expect(promptVersionFor("rules", 1)).toMatch(/-rules-bot1$/);
    const system = bodies[0].messages[0].content as string;
    expect(system).toContain("UN AUTÓMATA");
    expect(system).toContain("revela 2 de sus propias cartas");
    // Without bot mode the section is not there.
    expect(buildAgentPrompt(seat, viewFor(seat, state, [], events)).system).not.toContain("AUTÓMATA");
  });
});
