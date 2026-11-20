import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  GameConfig,
  GameState,
  StoredGameEvent,
  Winner,
} from "@/lib/codenames/types";
import type { GameMetrics } from "@/lib/codenames/metrics";

export type { GameMetrics } from "@/lib/codenames/metrics";

export interface GameRecord {
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

export interface GameSummary {
  id: string;
  seed: number;
  lang: string;
  config: GameConfig;
  promptVersion: string;
  status: GameRecord["status"];
  winner: Winner;
  winReason: string | null;
  metrics: GameMetrics | null;
  createdAt: number;
  updatedAt: number;
  finishedAt: number | null;
  turnsPlayed: number;
  seq: number;
}

const DATA_DIR =
  process.env.CODENAMES_DATA_DIR ??
  join(process.cwd(), "data", "codenames");
const DB_PATH = join(DATA_DIR, "codenames.db");

type DbGlobal = typeof globalThis & {
  __codenamesDb?: DatabaseSync;
};

function getDb(): DatabaseSync {
  const global = globalThis as DbGlobal;
  if (global.__codenamesDb) return global.__codenamesDb;

  mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      seed INTEGER NOT NULL,
      lang TEXT NOT NULL,
      config_json TEXT NOT NULL,
      prompt_version TEXT NOT NULL,
      status TEXT NOT NULL,
      winner TEXT,
      win_reason TEXT,
      state_json TEXT NOT NULL,
      metrics_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      started_at INTEGER,
      finished_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS events (
      game_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      type TEXT NOT NULL,
      seat TEXT,
      data_json TEXT NOT NULL,
      meta_json TEXT,
      model_id TEXT,
      prompt_tokens INTEGER,
      completion_tokens INTEGER,
      cost_usd REAL,
      latency_ms INTEGER,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (game_id, seq),
      FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_events_game_seq ON events(game_id, seq);
    CREATE INDEX IF NOT EXISTS idx_games_created ON games(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_games_client ON games(client_id, status);
  `);

  global.__codenamesDb = db;
  return db;
}

function parseJson<T>(value: unknown): T {
  if (typeof value !== "string" || !value) {
    throw new Error("JSON inválido en la base de datos.");
  }
  return JSON.parse(value) as T;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function mapGame(row: Record<string, unknown>): GameRecord {
  return {
    id: String(row.id),
    seed: Number(row.seed),
    lang: String(row.lang),
    config: parseJson<GameConfig>(row.config_json),
    promptVersion: String(row.prompt_version),
    status: String(row.status) as GameRecord["status"],
    winner: asString(row.winner) as Winner,
    winReason: asString(row.win_reason),
    state: parseJson<GameState>(row.state_json),
    metrics: row.metrics_json ? parseJson<GameMetrics>(row.metrics_json) : null,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    startedAt: asNumber(row.started_at),
    finishedAt: asNumber(row.finished_at),
    seq: Number(row.seq ?? 0),
  };
}

function mapSummary(row: Record<string, unknown>): GameSummary {
  const state = parseJson<GameState>(row.state_json);
  return {
    id: String(row.id),
    seed: Number(row.seed),
    lang: String(row.lang),
    config: parseJson<GameConfig>(row.config_json),
    promptVersion: String(row.prompt_version),
    status: String(row.status) as GameRecord["status"],
    winner: asString(row.winner) as Winner,
    winReason: asString(row.win_reason),
    metrics: row.metrics_json ? parseJson<GameMetrics>(row.metrics_json) : null,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    finishedAt: asNumber(row.finished_at),
    turnsPlayed: state.turnsPlayed,
    seq: Number(row.seq ?? 0),
  };
}

export interface CreateGameInput {
  id: string;
  clientId: string;
  seed: number;
  lang: string;
  config: GameConfig;
  promptVersion: string;
  state: GameState;
  now: number;
}

export function createGameRecord(input: CreateGameInput): GameRecord {
  const db = getDb();
  db.prepare(
    `INSERT INTO games (
      id, client_id, seed, lang, config_json, prompt_version, status, winner,
      win_reason, state_json, metrics_json, created_at, updated_at, started_at,
      finished_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'in_progress', NULL, NULL, ?, NULL, ?, ?, ?, NULL)`,
  ).run(
    input.id,
    input.clientId,
    input.seed,
    input.lang,
    JSON.stringify(input.config),
    input.promptVersion,
    JSON.stringify(input.state),
    input.now,
    input.now,
    input.now,
  );
  const game = getGame(input.id);
  if (!game) throw new Error("No se pudo crear la partida.");
  return game;
}

export function getGame(id: string): GameRecord | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT g.*, COALESCE((SELECT MAX(seq) FROM events e WHERE e.game_id = g.id), 0) AS seq
       FROM games g WHERE g.id = ?`,
    )
    .get(id) as Record<string, unknown> | undefined;
  return row ? mapGame(row) : null;
}

export function listGames(options: {
  clientId?: string;
  limit?: number;
} = {}): GameSummary[] {
  const db = getDb();
  const limit = Math.min(Math.max(options.limit ?? 30, 1), 100);
  const rows = (
    options.clientId
      ? db
          .prepare(
            `SELECT g.*, COALESCE((SELECT MAX(seq) FROM events e WHERE e.game_id = g.id), 0) AS seq
             FROM games g WHERE g.client_id = ? ORDER BY g.created_at DESC LIMIT ?`,
          )
          .all(options.clientId, limit)
      : db
          .prepare(
            `SELECT g.*, COALESCE((SELECT MAX(seq) FROM events e WHERE e.game_id = g.id), 0) AS seq
             FROM games g ORDER BY g.created_at DESC LIMIT ?`,
          )
          .all(limit)
  ) as Array<Record<string, unknown>>;
  return rows.map(mapSummary);
}

export function countActiveGames(clientId: string): number {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count FROM games
       WHERE client_id = ? AND status IN ('in_progress', 'paused')`,
    )
    .get(clientId) as { count?: number } | undefined;
  return Number(row?.count ?? 0);
}

export function saveState(
  id: string,
  state: GameState,
  status: GameRecord["status"],
  now: number,
): void {
  const db = getDb();
  const finished =
    state.status === "finished" || state.status === "aborted" ? now : null;
  db.prepare(
    `UPDATE games
     SET state_json = ?, status = ?, winner = ?, win_reason = ?,
         updated_at = ?, finished_at = COALESCE(finished_at, ?)
     WHERE id = ?`,
  ).run(
    JSON.stringify(state),
    status,
    state.winner,
    state.winReason,
    now,
    finished,
    id,
  );
}

export function saveMetrics(id: string, metrics: GameMetrics, now: number): void {
  const db = getDb();
  db.prepare(
    `UPDATE games SET metrics_json = ?, updated_at = ? WHERE id = ?`,
  ).run(JSON.stringify(metrics), now, id);
}

export function appendEvent(gameId: string, event: StoredGameEvent): void {
  const db = getDb();
  const meta = event.meta;
  db.prepare(
    `INSERT OR REPLACE INTO events (
      game_id, seq, type, seat, data_json, meta_json, model_id, prompt_tokens,
      completion_tokens, cost_usd, latency_ms, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    gameId,
    event.id,
    event.type,
    "seat" in event && event.seat ? event.seat : null,
    JSON.stringify(event.data),
    meta ? JSON.stringify(meta) : null,
    meta?.modelId ?? null,
    meta?.promptTokens ?? null,
    meta?.completionTokens ?? null,
    meta?.costUsd ?? null,
    meta?.latencyMs ?? null,
    event.at,
  );
}

export function getEvents(
  gameId: string,
  after = 0,
  limit = 5000,
): StoredGameEvent[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT seq, type, seat, data_json, meta_json, created_at
       FROM events WHERE game_id = ? AND seq > ? ORDER BY seq ASC LIMIT ?`,
    )
    .all(gameId, after, limit) as Array<Record<string, unknown>>;

  return rows.map((row) => {
    const base = {
      type: String(row.type),
      data: parseJson<Record<string, unknown>>(row.data_json),
      ...(row.seat ? { seat: String(row.seat) } : {}),
      ...(row.meta_json
        ? { meta: parseJson<Record<string, unknown>>(row.meta_json) }
        : {}),
      id: Number(row.seq),
      at: Number(row.created_at),
    };
    return base as unknown as StoredGameEvent;
  });
}

export function deleteGame(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM games WHERE id = ?").run(id);
}

export function getDatabasePath(): string {
  return DB_PATH;
}
