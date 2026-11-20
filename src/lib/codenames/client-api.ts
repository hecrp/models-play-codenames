import type {
  GameConfig,
  GameState,
  Language,
  Seat,
  StoredGameEvent,
  Winner,
} from "./types";
import type { GameMetrics } from "./metrics";
import { loadLocale } from "@/lib/i18n";

const CLIENT_KEY = "openchat:codenames:client:v1";
const ACTIVE_KEY = "openchat:codenames:active:v1";
const GOD_KEY = "openchat:codenames:god:v1";

export interface CodenamesRuntimeStatus {
  paused: boolean;
  speed: number;
  costUsd: number;
  running: boolean;
  fatalError: string | null;
  status: GameState["status"];
}

export interface CodenamesGame {
  id: string;
  seed: number;
  lang: string;
  config: GameConfig;
  promptVersion: string;
  status: "in_progress" | "paused" | "finished" | "aborted";
  winner: Winner;
  winReason: string | null;
  state: GameState;
  metrics: GameMetrics | null;
  createdAt: number;
  updatedAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  seq: number;
}

export interface CodenamesGameDetail {
  game: CodenamesGame;
  runtime: CodenamesRuntimeStatus | null;
  hasRuntime: boolean;
}

export interface CodenamesGameSummary {
  id: string;
  seed: number;
  lang: string;
  config: GameConfig;
  promptVersion: string;
  status: CodenamesGame["status"];
  winner: Winner;
  winReason: string | null;
  metrics: GameMetrics | null;
  createdAt: number;
  updatedAt: number;
  finishedAt: number | null;
  turnsPlayed: number;
  seq: number;
}

export interface CodenamesReplay {
  game: CodenamesGame;
  events: StoredGameEvent[];
}

export class CodenamesApiError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "CodenamesApiError";
    this.code = code;
  }
}

export function getClientId(): string {
  if (typeof window === "undefined") return "server";
  try {
    const existing = window.localStorage.getItem(CLIENT_KEY);
    if (existing && /^[A-Za-z0-9-]{8,64}$/.test(existing)) return existing;
    const created =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    window.localStorage.setItem(CLIENT_KEY, created);
    return created;
  } catch {
    return "anonymous";
  }
}

export function saveActiveGame(id: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (id) window.localStorage.setItem(ACTIVE_KEY, id);
    else window.localStorage.removeItem(ACTIVE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

export function loadActiveGame(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function loadGodMode(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(GOD_KEY) !== "0";
  } catch {
    return true;
  }
}

export function saveGodMode(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GOD_KEY, value ? "1" : "0");
  } catch {
    // Ignore storage failures.
  }
}

function headers(apiKey?: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "x-client-id": getClientId(),
    ...(apiKey?.trim() ? { "x-openrouter-key": apiKey.trim() } : {}),
  };
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { ...init?.headers, "x-locale": loadLocale() },
    cache: "no-store",
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string; code?: string };
    } | null;
    throw new CodenamesApiError(
      payload?.error?.message ?? `Request failed (${response.status}).`,
      payload?.error?.code ?? "request_failed",
    );
  }
  return (await response.json()) as T;
}

export async function createCodenamesGame(
  config: {
    seed: number;
    lang: Language;
    seats: Record<Seat, GameConfig["seats"][Seat]>;
    speed: number;
    maxCostUsd: number | null;
  },
  apiKey: string,
): Promise<{
  gameId: string;
  state: GameState;
  status: CodenamesGame["status"];
  config: GameConfig;
}> {
  return requestJson("/api/codenames/games", {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify(config),
  });
}

export async function fetchCodenamesGame(
  id: string,
): Promise<CodenamesGameDetail> {
  return requestJson(`/api/codenames/games/${encodeURIComponent(id)}`);
}

export async function fetchCodenamesGames(): Promise<{
  games: CodenamesGameSummary[];
}> {
  return requestJson("/api/codenames/games?limit=30");
}

export async function fetchCodenamesReplay(
  id: string,
): Promise<CodenamesReplay> {
  return requestJson(`/api/codenames/games/${encodeURIComponent(id)}/replay`);
}

export async function controlCodenamesGame(
  id: string,
  action: "pause" | "resume" | "step" | "step_turn" | "abort" | "speed",
  options: { speed?: number; apiKey?: string } = {},
): Promise<{
  ok: boolean;
  code?: string;
  message?: string;
  status?: CodenamesRuntimeStatus;
}> {
  return requestJson(`/api/codenames/games/${encodeURIComponent(id)}/control`, {
    method: "POST",
    headers: headers(options.apiKey),
    body: JSON.stringify({
      action,
      ...(options.speed !== undefined ? { speed: options.speed } : {}),
    }),
  });
}

export function eventsUrl(id: string, lastEventId: number): string {
  return `/api/codenames/games/${encodeURIComponent(id)}/events?lastEventId=${lastEventId}`;
}

export type HumanAction =
  | { type: "give_clue"; word: string; number: number; say?: string }
  | { type: "guess"; word: string; say?: string }
  | { type: "stop"; say?: string };

export type GuessResolution =
  | { kind: "exact"; word: string }
  | { kind: "suggestion"; word: string }
  | { kind: "unknown" };

export async function submitHumanAction(id: string, action: HumanAction): Promise<void> {
  await requestJson(`/api/codenames/games/${encodeURIComponent(id)}/human`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ action }),
  });
}

export async function resolveHumanGuess(
  id: string,
  text: string,
  apiKey?: string,
): Promise<GuessResolution> {
  return requestJson(`/api/codenames/games/${encodeURIComponent(id)}/human`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify({ resolve: text }),
  });
}

export function formatSeed(seed: number): string {
  return seed.toString();
}
