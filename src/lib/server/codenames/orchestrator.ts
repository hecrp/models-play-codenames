import {
  abortGame,
  apply,
  botTurn,
  createGame,
  forceEndTurn,
  MAX_ATTEMPTS,
} from "@/lib/codenames/engine";
import { buildPublicHistory, viewFor } from "@/lib/codenames/view";
import { PROMPT_VERSION } from "@/lib/codenames/prompts";
import { gameText } from "@/lib/codenames/messages";
import { operativeSeat, spymasterSeat } from "@/lib/codenames/seats";
import type {
  AgentAdapter,
  AgentResponse,
  BotConfig,
  EngineEvent,
  EventMeta,
  GameState,
  Language,
  Seat,
  SeatConfig,
  StoredGameEvent,
} from "@/lib/codenames/types";

export const DEFAULT_BASE_DELAY_MS = 700;
export const SUPPORTED_SPEEDS = [0.25, 0.5, 1, 2] as const;

export interface OrchestratorHooks {
  onEvent?: (event: StoredGameEvent) => void | Promise<void>;
  onState?: (state: GameState) => void | Promise<void>;
  onError?: (error: unknown) => void | Promise<void>;
}

export interface OrchestratorOptions {
  gameId: string;
  seed: number;
  seats: Record<Seat, SeatConfig>;
  adapter: AgentAdapter;
  lang?: Language;
  wordList?: readonly string[];
  initialState?: GameState;
  initialEvents?: StoredGameEvent[];
  hooks?: OrchestratorHooks;
  baseDelayMs?: number;
  speed?: number;
  maxCostUsd?: number | null;
  /** Study bot mode: this team is an automaton (botTurn), never asked to a model. */
  bot?: BotConfig;
  signal?: AbortSignal;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

type AskResult =
  | { kind: "ok" }
  | { kind: "exhausted" }
  | { kind: "paused" }
  | { kind: "aborted" };

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isOver(state: GameState): boolean {
  return state.status === "finished" || state.status === "aborted";
}

/**
 * Drives one game: builds filtered views, calls the agent adapter, validates
 * with the engine, emits events, enforces retries/timeouts and supports
 * pause/resume/step/speed/abort.
 */
/** Free retries per move for transient (infrastructure) failures. */
export const MAX_TRANSIENT_RETRIES = 3;

export class GameOrchestrator {
  state: GameState;
  readonly events: StoredGameEvent[] = [];
  readonly gameId: string;

  private readonly seats: Record<Seat, SeatConfig>;
  private readonly adapter: AgentAdapter;
  private readonly hooks?: OrchestratorHooks;
  private readonly baseDelayMs: number;
  private readonly maxCostUsd: number | null;
  private readonly bot?: BotConfig;
  private readonly nowFn: () => number;
  private readonly sleepFn: (ms: number) => Promise<void>;
  private readonly abortController = new AbortController();

  private nextSeq = 1;
  private pausedFlag = false;
  private stepBudget = 0;
  private stepUntilTurn: number | null = null;
  private speedValue: number;
  private runningFlag = false;
  private abortedFlag = false;
  private flushed = false;
  private initialEventsPersisted = false;
  private waiters: Array<() => void> = [];
  private cost = 0;
  private fatalMessage: string | null = null;
  private lastSayChars = 0;

  constructor(options: OrchestratorOptions) {
    this.gameId = options.gameId;
    this.seats = options.seats;
    this.adapter = options.adapter;
    this.hooks = options.hooks;
    this.baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
    this.maxCostUsd = options.maxCostUsd ?? null;
    this.bot = options.bot;
    this.nowFn = options.now ?? Date.now;
    this.sleepFn = options.sleep ?? delay;
    this.speedValue = options.speed ?? 1;

    if (options.initialState) {
      this.state = structuredClone(options.initialState);
      if (options.initialEvents?.length) {
        this.events.push(...options.initialEvents);
        this.nextSeq =
          Math.max(...options.initialEvents.map((event) => event.id)) + 1;
        this.initialEventsPersisted = true;
      }
      this.cost = this.events.reduce(
        (total, event) => total + (event.meta?.costUsd ?? 0),
        0,
      );
    } else {
      const created = createGame({
        id: options.gameId,
        seed: options.seed,
        lang: options.lang,
        wordList: options.wordList,
      });
      this.state = created.state;
      for (const event of created.events) {
        this.storeEvent(event);
      }
    }

    if (options.signal) {
      if (options.signal.aborted) {
        this.abortedFlag = true;
      } else {
        options.signal.addEventListener(
          "abort",
          () => {
            this.abort();
          },
          { once: true },
        );
      }
    }
  }

  get paused(): boolean {
    return this.pausedFlag;
  }

  get speed(): number {
    return this.speedValue;
  }

  get running(): boolean {
    return this.runningFlag;
  }

  get aborted(): boolean {
    return this.abortedFlag;
  }

  get costUsd(): number {
    return this.cost;
  }

  get fatalError(): string | null {
    return this.fatalMessage;
  }

  getStatus() {
    return {
      paused: this.pausedFlag,
      speed: this.speedValue,
      costUsd: this.cost,
      running: this.runningFlag,
      fatalError: this.fatalMessage,
      status: this.state.status,
    };
  }

  /** Events created in the constructor are persisted before run() starts. */
  async flushInitialEvents(): Promise<void> {
    if (this.flushed) return;
    this.flushed = true;
    if (!this.initialEventsPersisted) {
      for (const event of this.events) {
        await this.hooks?.onEvent?.(event);
      }
    }
    await this.hooks?.onState?.(this.state);
  }

  private storeEvent(event: EngineEvent, meta?: EventMeta): StoredGameEvent {
    const stored = {
      ...event,
      ...(meta ? { meta: { ...event.meta, ...meta } } : {}),
      id: this.nextSeq,
      at: this.nowFn(),
    } as StoredGameEvent;
    if ("data" in event && "say" in event.data) {
      const say = event.data.say;
      if (typeof say === "string") this.lastSayChars = say.length;
    }
    this.nextSeq += 1;
    this.events.push(stored);
    return stored;
  }

  private async emit(event: EngineEvent, meta?: EventMeta): Promise<void> {
    const stored = this.storeEvent(event, meta);
    await this.hooks?.onEvent?.(stored);
  }

  private async emitAll(
    events: EngineEvent[],
    meta?: EventMeta,
  ): Promise<void> {
    for (let index = 0; index < events.length; index += 1) {
      await this.emit(events[index], index === 0 ? meta : undefined);
    }
  }

  private async notifyState(): Promise<void> {
    await this.hooks?.onState?.(this.state);
  }

  private releaseWaiters(): void {
    const waiters = this.waiters;
    this.waiters = [];
    for (const resolve of waiters) resolve();
  }

  private async gate(): Promise<boolean> {
    while (!this.abortedFlag) {
      if (!this.pausedFlag) return true;
      if (this.stepUntilTurn !== null) {
        if (this.stepUntilTurn === this.state.turnsPlayed) return true;
        this.stepUntilTurn = null;
      }
      if (this.stepBudget > 0) {
        this.stepBudget -= 1;
        return true;
      }
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
      });
    }
    return false;
  }

  async pause(): Promise<void> {
    if (this.pausedFlag || isOver(this.state)) return;
    this.pausedFlag = true;
    this.stepBudget = 0;
    this.stepUntilTurn = null;
    await this.emit({ type: "game_paused", data: { reason: "user" } });
    await this.notifyState();
  }

  async resume(): Promise<void> {
    if (!this.pausedFlag) return;
    this.pausedFlag = false;
    this.stepBudget = 0;
    this.stepUntilTurn = null;
    this.fatalMessage = null;
    this.releaseWaiters();
    await this.emit({ type: "game_resumed", data: { control: "resume" } });
    await this.notifyState();
  }

  async step(): Promise<void> {
    if (isOver(this.state)) return;
    const wasPaused = this.pausedFlag;
    this.pausedFlag = true;
    this.stepBudget += 1;
    if (!wasPaused) {
      await this.emit({ type: "game_paused", data: { reason: "user" } });
      await this.notifyState();
    }
    this.releaseWaiters();
  }

  /** Plays every remaining action of the current turn, then pauses again. */
  async stepTurn(): Promise<void> {
    if (isOver(this.state)) return;
    const wasPaused = this.pausedFlag;
    this.pausedFlag = true;
    this.stepUntilTurn = this.state.turnsPlayed;
    if (!wasPaused) {
      await this.emit({ type: "game_paused", data: { reason: "user" } });
      await this.notifyState();
    }
    this.releaseWaiters();
  }

  async setSpeed(speed: number): Promise<number> {
    const next = (SUPPORTED_SPEEDS as readonly number[]).includes(speed)
      ? speed
      : 1;
    this.speedValue = next;
    await this.emit({ type: "control_changed", data: { speed: next } });
    return next;
  }

  abort(): void {
    if (this.abortedFlag) return;
    this.abortedFlag = true;
    this.abortController.abort();
    this.releaseWaiters();
  }

  private currentSeat(): Seat {
    return this.state.turn.phase === "clue"
      ? spymasterSeat(this.state.turn.team)
      : operativeSeat(this.state.turn.team);
  }

  private addCost(meta: EventMeta): void {
    if (typeof meta.costUsd === "number" && Number.isFinite(meta.costUsd)) {
      this.cost += meta.costUsd;
    }
  }

  private async interActionDelay(): Promise<void> {
    // Table talk needs a moment to be read: longer lines linger a bit more.
    const readingMs =
      this.lastSayChars > 0
        ? Math.min(1800, 400 + this.lastSayChars * 12)
        : 0;
    this.lastSayChars = 0;
    const ms = Math.max(0, (this.baseDelayMs + readingMs) / this.speedValue);
    if (ms > 0) await this.sleepFn(ms);
  }

  private async askWithRetries(seat: Seat): Promise<AskResult> {
    let feedback: string | undefined;
    let attempt = 1;
    // Infrastructure failures (timeouts…) are not the model's fault: they are
    // retried without spending one of the move's attempts, up to this cap.
    let transientRetries = 0;

    while (attempt <= MAX_ATTEMPTS) {
      if (this.abortedFlag) return { kind: "aborted" };
      if (!(await this.gate())) return { kind: "aborted" };

      const view = viewFor(
        seat,
        this.state,
        buildPublicHistory(this.events, { botTeam: this.bot?.team }),
        this.events,
      );

      await this.emit({
        type: "thinking",
        seat,
        data: { state: "start" },
      });

      let response: AgentResponse;
      try {
        response = await this.adapter.request({
          seat,
          view,
          config: this.seats[seat],
          feedback,
          signal: this.abortController.signal,
        });
      } catch (error) {
        response = {
          action: null,
          error: {
            code: "invalid_action",
            message:
              error instanceof Error
                ? error.message
                : gameText(this.state.lang).adapterFailed,
            fatal: false,
          },
          meta: {},
        };
      } finally {
        await this.emit({
          type: "thinking",
          seat,
          data: { state: "end" },
        });
      }

      this.addCost(response.meta);

      if (this.abortedFlag) return { kind: "aborted" };

      if (response.action) {
        const result = apply(this.state, seat, response.action);
        if (result.ok) {
          this.state = result.state;
          await this.emitAll(result.events, response.meta);
          await this.notifyState();
          return { kind: "ok" };
        }

        await this.emit(
          {
            type: "agent_error",
            seat,
            data: {
              code: result.code,
              message: result.message,
              attemptsLeft: MAX_ATTEMPTS - attempt,
              phase: this.state.turn.phase,
            },
          },
          response.meta,
        );
        feedback = result.message;
        attempt += 1;
        continue;
      }

      const message =
        response.error?.message ?? gameText(this.state.lang).noAction;
      const freeRetry =
        response.error?.transient === true &&
        !response.error.fatal &&
        transientRetries < MAX_TRANSIENT_RETRIES;
      await this.emit(
        {
          type: "agent_error",
          seat,
          data: {
            code: response.error?.code ?? "invalid_action",
            message,
            attemptsLeft: MAX_ATTEMPTS - attempt + (freeRetry ? 1 : 0),
            phase: this.state.turn.phase,
            ...(response.error?.transient ? { transient: true } : {}),
          },
        },
        response.meta,
      );

      if (response.error?.fatal) {
        this.pausedFlag = true;
        this.stepBudget = 0;
        this.fatalMessage = message;
        await this.emit({
          type: "game_paused",
          data: { reason: "error", message },
        });
        await this.notifyState();
        return { kind: "paused" };
      }

      if (freeRetry) {
        transientRetries += 1;
        continue;
      }
      if (!response.error?.transient) feedback = message;
      attempt += 1;
    }

    return { kind: "exhausted" };
  }

  async run(): Promise<GameState> {
    if (this.runningFlag) {
      throw new Error("The game is already running.");
    }
    if (isOver(this.state)) return this.state;

    this.runningFlag = true;

    try {
      await this.flushInitialEvents();

      while (!isOver(this.state) && !this.abortedFlag) {
        // The automaton plays its whole turn at once, without a model call.
        if (this.bot && this.state.turn.team === this.bot.team && this.state.turn.phase === "clue") {
          if (!(await this.gate())) break;
          const turn = botTurn(this.state, this.bot.pace);
          this.state = turn.state;
          // No meta: no model was called.
          await this.emitAll(turn.events);
          await this.notifyState();
          continue;
        }
        const seat = this.currentSeat();
        const result = await this.askWithRetries(seat);

        if (result.kind === "aborted") break;
        if (result.kind === "paused") continue;

        if (result.kind === "exhausted") {
          const phase = this.state.turn.phase;
          const forced = forceEndTurn(
            this.state,
            phase === "clue" ? "clue_failed" : "attempts_exhausted",
            seat,
          );
          this.state = forced.state;
          await this.emitAll(forced.events);
          await this.notifyState();
        }

        if (
          this.maxCostUsd !== null &&
          this.cost >= this.maxCostUsd &&
          !isOver(this.state)
        ) {
          const stopped = abortGame(this.state, "cost_limit");
          this.state = stopped.state;
          await this.emitAll(stopped.events);
          await this.notifyState();
          break;
        }

        if (!isOver(this.state)) {
          await this.interActionDelay();
        }
      }

      if (
        this.abortedFlag &&
        !isOver(this.state)
      ) {
        const stopped = abortGame(this.state, "aborted");
        this.state = stopped.state;
        await this.emitAll(stopped.events);
        await this.notifyState();
      }

      return this.state;
    } catch (error) {
      this.fatalMessage =
        error instanceof Error ? error.message : "Unknown error.";
      this.pausedFlag = true;
      await this.hooks?.onError?.(error);
      await this.emit({
        type: "game_paused",
        data: { reason: "error", message: this.fatalMessage },
      });
      await this.notifyState();
      return this.state;
    } finally {
      this.runningFlag = false;
      this.releaseWaiters();
    }
  }
}
