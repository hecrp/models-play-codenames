import { describe, expect, it } from "vitest";
import { parseControl, parseGameConfig } from "../../src/lib/codenames/validation";
import { SEATS, spymasterSeat, operativeSeat } from "../../src/lib/codenames/seats";
import { DEFAULT_CODENAMES_MODEL_ID } from "../../src/lib/codenames/model-presets";
import { PROMPT_VERSION } from "../../src/lib/codenames/prompts";

function seats() {
  return Object.fromEntries(
    SEATS.map((seat) => [
      seat,
      {
        modelId: DEFAULT_CODENAMES_MODEL_ID,
        temperature: seat.endsWith("spymaster") ? 0.7 : 0.3,
        avatarId: "zorro",
        displayName: `Seat ${seat}`,
      },
    ]),
  );
}

describe("parseGameConfig", () => {
  it("builds a valid game config", () => {
    const parsed = parseGameConfig({
      seed: 42,
      lang: "es",
      speed: 2,
      maxCostUsd: 0.05,
      seats: seats(),
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.config.seed).toBe(42);
    expect(parsed.config.speed).toBe(2);
    expect(parsed.config.maxCostUsd).toBe(0.05);
    expect(parsed.config.promptVersion).toBe(PROMPT_VERSION);
    expect(parsed.config.seats[spymasterSeat("red")].temperature).toBe(0.7);
    expect(parsed.config.seats[operativeSeat("blue")].temperature).toBe(0.3);
  });

  it("falls back to a random seed and normalises unknown values", () => {
    const parsed = parseGameConfig({
      lang: "es",
      speed: 7,
      seats: { ...seats(), red_spymaster: { ...seats().red_spymaster, avatarId: "nope" } },
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.config.seed).toBeGreaterThanOrEqual(0);
    expect(parsed.config.speed).toBe(1);
    expect(parsed.config.seats.red_spymaster.avatarId).toBe("zorro");
  });

  it("rejects missing seats, invalid languages and bad temperatures", () => {
    expect(parseGameConfig({ seats: {} }).ok).toBe(false);
    expect(
      parseGameConfig({ lang: "fr", seats: seats() }).ok,
    ).toBe(false);
    expect(parseGameConfig({ lang: "en", seats: seats() }).ok).toBe(true);
    const badTemperature = seats();
    badTemperature.red_spymaster.temperature = 4;
    expect(
      parseGameConfig({ lang: "es", seats: badTemperature }).ok,
    ).toBe(false);
  });

  it("treats zero cost as no cap", () => {
    const parsed = parseGameConfig({ seed: 1, seats: seats(), maxCostUsd: 0 });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.config.maxCostUsd).toBeNull();
  });
});

describe("parseControl", () => {
  it("accepts the valid controls", () => {
    expect(parseControl({ action: "pause" })).toEqual({ ok: true, action: "pause" });
    expect(parseControl({ action: "step" })).toEqual({ ok: true, action: "step" });
    expect(parseControl({ action: "abort" })).toEqual({ ok: true, action: "abort" });
    expect(parseControl({ action: "speed", speed: 0.5 })).toEqual({
      ok: true,
      action: "speed",
      speed: 0.5,
    });
    expect(parseControl({ action: "speed", speed: 0.25 })).toEqual({
      ok: true,
      action: "speed",
      speed: 0.25,
    });
  });

  it("rejects unknown actions and speeds", () => {
    expect(parseControl({ action: "dance" }).ok).toBe(false);
    expect(parseControl({ action: "speed", speed: 3 }).ok).toBe(false);
    expect(parseControl({}).ok).toBe(false);
  });
});
