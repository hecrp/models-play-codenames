import { AVATARS, DEFAULT_SEAT_AVATARS, avatarById, isAvatarId } from "./avatars";
import { DEFAULT_CODENAMES_MODEL_ID } from "./model-presets";
import { PROMPT_VERSION } from "./prompts";
import { randomSeed } from "./prng";
import { SEATS } from "./seats";
import { apiText } from "./api-messages";
import { isLanguage } from "./messages";
import type { GameConfig, Language, Seat, SeatConfig } from "./types";

type ApiText = ReturnType<typeof apiText>;

const MODEL_ID_PATTERN = /^[A-Za-z0-9._:/@+~-]+$/;
const SPEEDS = [0.25, 0.5, 1, 2];
export const HUMAN_MODEL_ID = "human";

export type ConfigParseResult =
  | { ok: true; config: GameConfig }
  | { ok: false; message: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function numberValue(value: unknown, fallback?: number): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim())) {
    return Number(value.trim());
  }
  return fallback;
}

function parseSeat(raw: unknown, seat: Seat, text: ApiText): SeatConfig | string {
  const value = asRecord(raw);
  if (!value) return text.missingSeat(seat);

  const human = value.human === true;
  const modelId = human
    ? HUMAN_MODEL_ID
    : typeof value.modelId === "string" ? value.modelId.trim() : "";
  if (!modelId || modelId.length > 200 || !MODEL_ID_PATTERN.test(modelId)) {
    return text.invalidModel(seat);
  }

  const defaultTemperature = seat.endsWith("spymaster") ? 0.7 : 0.3;
  const temperature = numberValue(value.temperature, defaultTemperature);
  if (temperature === undefined || temperature < 0 || temperature > 2) {
    return text.invalidTemperature(seat);
  }

  const avatarId =
    typeof value.avatarId === "string" && isAvatarId(value.avatarId)
      ? value.avatarId
      : DEFAULT_SEAT_AVATARS[seat];
  const avatar = avatarById(avatarId);
  const displayName =
    typeof value.displayName === "string" && value.displayName.trim()
      ? value.displayName.trim().slice(0, 40)
      : avatar?.name ?? "Player";

  return {
    seat,
    modelId,
    temperature,
    avatarId,
    displayName,
    ...(human ? { human: true } : {}),
  };
}

export function parseGameConfig(raw: unknown, locale: Language = "es"): ConfigParseResult {
  const text = apiText(locale);
  const body = asRecord(raw);
  if (!body) return { ok: false, message: text.invalidBody };

  const rawSeed = numberValue(body.seed);
  const seed =
    rawSeed === undefined ? randomSeed() : Math.trunc(rawSeed);
  if (seed < 0 || seed > 2_147_483_647) {
    return { ok: false, message: text.invalidSeed };
  }

  const lang = body.lang ?? "es";
  if (!isLanguage(lang)) {
    return { ok: false, message: text.invalidLanguage };
  }

  const rawSeats = asRecord(body.seats);
  if (!rawSeats) {
    return { ok: false, message: text.missingSeats };
  }

  const seats = {} as Record<Seat, SeatConfig>;
  for (const seat of SEATS) {
    const parsed = parseSeat(rawSeats[seat], seat, text);
    if (typeof parsed === "string") return { ok: false, message: parsed };
    seats[seat] = parsed;
  }
  if (SEATS.filter((seat) => seats[seat].human).length > 1) {
    return { ok: false, message: text.oneHuman };
  }

  const speedValue = numberValue(body.speed, 1);
  const speed =
    speedValue !== undefined && SPEEDS.includes(speedValue) ? speedValue : 1;

  const rawCost = numberValue(body.maxCostUsd, 1);
  const maxCostUsd =
    rawCost === undefined || rawCost === 0
      ? null
      : Math.min(Math.max(rawCost, 0.01), 100);

  return {
    ok: true,
    config: {
      seed,
      lang,
      seats,
      promptVersion: PROMPT_VERSION,
      speed,
      maxCostUsd,
    },
  };
}

export type ControlAction = "pause" | "resume" | "step" | "step_turn" | "abort" | "speed";

export type ControlParseResult =
  | { ok: true; action: ControlAction; speed?: number }
  | { ok: false; message: string };

export function parseControl(raw: unknown, locale: Language = "es"): ControlParseResult {
  const text = apiText(locale);
  const body = asRecord(raw);
  if (!body || typeof body.action !== "string") {
    return { ok: false, message: text.missingControl };
  }
  const action = body.action;
  if (
    action !== "pause" &&
    action !== "resume" &&
    action !== "step" &&
    action !== "step_turn" &&
    action !== "abort" &&
    action !== "speed"
  ) {
    return { ok: false, message: text.unknownControl(action) };
  }
  if (action === "speed") {
    const speed = numberValue(body.speed, 1);
    if (speed === undefined || !SPEEDS.includes(speed)) {
      return { ok: false, message: text.invalidSpeed };
    }
    return { ok: true, action, speed };
  }
  return { ok: true, action };
}

export function parseClientId(value: string | null): string {
  const id = value?.trim() ?? "";
  if (/^[A-Za-z0-9-]{8,64}$/.test(id)) return id;
  return "anonymous";
}

export const DEFAULT_GAME_MODEL = DEFAULT_CODENAMES_MODEL_ID;
export const AVATAR_COUNT = AVATARS.length;
