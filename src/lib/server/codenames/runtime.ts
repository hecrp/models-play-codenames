import { promptVersionFor } from "@/lib/codenames/prompts";
import { MODEL_CALL_TIMEOUT_MS } from "@/lib/codenames/reasoning";
import { computeMetrics } from "@/lib/codenames/metrics";
import type {
  GameAction,
  GameConfig,
  Seat,
  StoredGameEvent,
} from "@/lib/codenames/types";
import type { ModelInfo } from "@/lib/types";
import { adapterKeys, seatsWithoutKey, type ProviderKeys } from "@/lib/server/provider-keys";
import { createOpenRouterAgentAdapter } from "./agents";
import {
  createMixedAdapter,
  humanSeat,
  HumanInbox,
  resolveGuess,
  type GuessResolution,
} from "./human";
import { GameOrchestrator } from "./orchestrator";
import {
  appendEvent,
  countActiveGames,
  createGameRecord,
  deleteGame,
  getEvents,
  getGame,
  saveMetrics,
  saveState,
  type GameRecord,
} from "./store";

type EventListener = (event: StoredGameEvent) => void;

interface RuntimeEntry {
  gameId: string;
  clientId: string;
  orchestrator: GameOrchestrator;
  subscribers: Set<EventListener>;
  /** In memory only while the game runs; dropped when it ends. */
  keys: ProviderKeys | null;
  models: readonly ModelInfo[];
  runPromise: Promise<unknown> | null;
  inbox: HumanInbox;
  config: GameConfig;
}

interface RuntimeGlobal {
  __codenamesRuntime?: Map<string, RuntimeEntry>;
}

function entries(): Map<string, RuntimeEntry> {
  const global = globalThis as typeof globalThis & RuntimeGlobal;
  if (!global.__codenamesRuntime) {
    global.__codenamesRuntime = new Map<string, RuntimeEntry>();
  }
  return global.__codenamesRuntime;
}

function statusOf(entry: RuntimeEntry): GameRecord["status"] {
  const state = entry.orchestrator.state;
  if (state.status === "finished" || state.status === "aborted") {
    return state.status;
  }
  return entry.orchestrator.getStatus().paused ? "paused" : "in_progress";
}

function persist(entry: RuntimeEntry): void {
  const state = entry.orchestrator.state;
  saveState(entry.gameId, state, statusOf(entry), Date.now());
  if (state.status === "finished" || state.status === "aborted") {
    saveMetrics(
      entry.gameId,
      computeMetrics(entry.orchestrator.events),
      Date.now(),
    );
    entry.keys = null;
  }
}

function broadcast(entry: RuntimeEntry, event: StoredGameEvent): void {
  for (const listener of [...entry.subscribers]) {
    try {
      listener(event);
    } catch {
      entry.subscribers.delete(listener);
    }
  }
}

function register(
  entry: Omit<RuntimeEntry, "subscribers" | "runPromise">,
): RuntimeEntry {
  const full: RuntimeEntry = {
    ...entry,
    subscribers: new Set(),
    runPromise: null,
  };
  entries().set(entry.gameId, full);
  full.runPromise = full.orchestrator
    .run()
    .then(() => persist(full))
    .catch((error) => {
      console.error(`[codenames] Error en la partida ${full.gameId}:`, error);
    })
    .finally(() => {
      persist(full);
      full.runPromise = null;
      if (
        full.orchestrator.state.status === "finished" ||
        full.orchestrator.state.status === "aborted"
      ) {
        const timer = setTimeout(() => {
          if (entries().get(full.gameId) === full) {
            entries().delete(full.gameId);
          }
        }, 60_000);
        timer.unref?.();
      }
    });
  return full;
}

export interface StartGameInput {
  id: string;
  clientId: string;
  config: GameConfig;
  keys: ProviderKeys;
  models: readonly ModelInfo[];
}

export async function startGame(input: StartGameInput): Promise<GameRecord> {
  const inbox = new HumanInbox();
  const adapter = createMixedAdapter(
    createOpenRouterAgentAdapter({
      ...adapterKeys(input.keys, input.config),
      models: input.models,
      timeoutMs: MODEL_CALL_TIMEOUT_MS,
      promptVariant: input.config.promptVariant,
    }),
    inbox,
    input.config.seats,
  );

  const orchestrator = new GameOrchestrator({
    gameId: input.id,
    seed: input.config.seed,
    lang: input.config.lang,
    seats: input.config.seats,
    adapter,
    speed: input.config.speed,
    maxCostUsd: input.config.maxCostUsd,
    hooks: {
      onEvent: (event) => {
        const entry = entries().get(input.id);
        if (!entry) return;
        appendEvent(input.id, event);
        broadcast(entry, event);
      },
      onState: () => {
        const entry = entries().get(input.id);
        if (entry) persist(entry);
      },
      onError: (error) => {
        console.error(`[codenames] Error de modelo en ${input.id}:`, error);
      },
    },
  });

  try {
    const record = createGameRecord({
      id: input.id,
      clientId: input.clientId,
      seed: input.config.seed,
      lang: input.config.lang,
      config: input.config,
      promptVersion: input.config.promptVersion || promptVersionFor(input.config.promptVariant),
      state: orchestrator.state,
      now: Date.now(),
    });

    const entry = register({
      gameId: input.id,
      clientId: input.clientId,
      orchestrator,
      keys: input.keys,
      models: input.models,
      inbox,
      config: input.config,
    });

    await orchestrator.flushInitialEvents();
    return record;
  } catch (error) {
    deleteGame(input.id);
    entries().delete(input.id);
    throw error;
  }
}

export function getRuntime(gameId: string): RuntimeEntry | undefined {
  return entries().get(gameId);
}

export function getRuntimeStatus(gameId: string) {
  const entry = entries().get(gameId);
  return entry ? entry.orchestrator.getStatus() : null;
}

export function subscribe(
  gameId: string,
  listener: EventListener,
): () => void {
  const entry = entries().get(gameId);
  if (!entry) return () => {};
  entry.subscribers.add(listener);
  return () => {
    entry.subscribers.delete(listener);
  };
}

export function hasRuntime(gameId: string): boolean {
  return entries().has(gameId);
}

export async function controlGame(
  gameId: string,
  action: "pause" | "resume" | "step" | "step_turn" | "abort" | "speed",
  options: {
    speed?: number;
    keys?: ProviderKeys | null;
    models?: readonly ModelInfo[];
    clientId?: string;
  } = {},
): Promise<{
  ok: boolean;
  code?: string;
  message?: string;
  status?: ReturnType<GameOrchestrator["getStatus"]>;
}> {
  let entry = entries().get(gameId);

  if (!entry && action === "resume") {
    entry = await recoverRuntime(
      gameId,
      options.keys ?? null,
      options.models,
      options.clientId ?? "",
    );
  }

  if (!entry) {
    return {
      ok: false,
      code: "not_running",
      message: "La partida no está en ejecución. Reanúdala con tu API key.",
    };
  }

  const orchestrator = entry.orchestrator;
  if (
    orchestrator.state.status === "finished" ||
    orchestrator.state.status === "aborted"
  ) {
    return { ok: false, code: "game_over", message: "La partida ya terminó." };
  }

  switch (action) {
    case "pause":
      await orchestrator.pause();
      break;
    case "resume":
      await orchestrator.resume();
      break;
    case "step":
      await orchestrator.step();
      break;
    case "step_turn":
      await orchestrator.stepTurn();
      break;
    case "abort":
      orchestrator.abort();
      break;
    case "speed":
      await orchestrator.setSpeed(options.speed ?? 1);
      break;
  }

  persist(entry);
  return { ok: true, status: orchestrator.getStatus() };
}

export async function recoverRuntime(
  gameId: string,
  keys: ProviderKeys | null,
  models: readonly ModelInfo[] | undefined,
  clientId = "",
): Promise<RuntimeEntry | undefined> {
  const existing = entries().get(gameId);
  if (existing) return existing;

  const game = getGame(gameId);
  if (!game) return undefined;
  if (game.status === "finished" || game.status === "aborted") return undefined;
  if (!keys || seatsWithoutKey(game.config, keys).length > 0) return undefined;
  if (!models) return undefined;

  const events = getEvents(gameId, 0);
  const inbox = new HumanInbox();
  const adapter = createMixedAdapter(
    createOpenRouterAgentAdapter({
      ...adapterKeys(keys, game.config),
      models,
      timeoutMs: MODEL_CALL_TIMEOUT_MS,
      promptVariant: game.config.promptVariant,
    }),
    inbox,
    game.config.seats,
  );

  const orchestrator = new GameOrchestrator({
    gameId,
    seed: game.seed,
    seats: game.config.seats,
    adapter,
    initialState: game.state,
    initialEvents: events,
    speed: game.config.speed,
    maxCostUsd: game.config.maxCostUsd,
    hooks: {
      onEvent: (event) => {
        const entry = entries().get(gameId);
        if (!entry) return;
        appendEvent(gameId, event);
        broadcast(entry, event);
      },
      onState: () => {
        const entry = entries().get(gameId);
        if (entry) persist(entry);
      },
      onError: (error) => {
        console.error(`[codenames] Error al recuperar ${gameId}:`, error);
      },
    },
  });

  return register({
    gameId,
    clientId,
    orchestrator,
    keys,
    models,
    inbox,
    config: game.config,
  });
}

type HumanCheck =
  | { ok: true; entry: RuntimeEntry; seat: Seat }
  | { ok: false; code: string; message: string };

function humanEntry(gameId: string, clientId: string): HumanCheck {
  const entry = entries().get(gameId);
  if (!entry) {
    return { ok: false, code: "not_running", message: "La partida no está en ejecución." };
  }
  const seat = humanSeat(entry.config);
  if (!seat) {
    return { ok: false, code: "no_human", message: "En esta partida no juega ninguna persona." };
  }
  if (entry.clientId && entry.clientId !== clientId) {
    return { ok: false, code: "forbidden", message: "Este asiento pertenece a otro navegador." };
  }
  return { ok: true, entry, seat };
}

export function submitHumanAction(
  gameId: string,
  clientId: string,
  action: GameAction,
): { ok: true } | { ok: false; code: string; message: string } {
  const check = humanEntry(gameId, clientId);
  if (!check.ok) return check;
  const result = check.entry.inbox.submit(check.seat, action, check.entry.orchestrator.state);
  return result.ok ? result : { ok: false, code: "invalid_action", message: result.message };
}

export async function resolveHumanGuess(
  gameId: string,
  clientId: string,
  text: string,
  apiKey: string | null,
): Promise<
  { ok: true; resolution: GuessResolution } | { ok: false; code: string; message: string }
> {
  const check = humanEntry(gameId, clientId);
  if (!check.ok) return check;
  const hidden = check.entry.orchestrator.state.board
    .filter((card) => !card.revealed)
    .map((card) => card.word);
  const resolution = await resolveGuess(
    text,
    hidden,
    apiKey ?? check.entry.keys?.openrouter ?? null,
    check.entry.orchestrator.state.lang,
  );
  return { ok: true, resolution };
}

export function activeGameCount(clientId: string): number {
  return countActiveGames(clientId);
}
