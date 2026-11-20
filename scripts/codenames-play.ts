import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomSeed } from "../src/lib/codenames/prng";
import { SEATS, teamLabel, teamOfSeat } from "../src/lib/codenames/seats";
import { ES_WORDS } from "../src/lib/codenames/words/es";
import { DEFAULT_CODENAMES_MODEL_ID, CODENAMES_EXAMPLE_MODELS } from "../src/lib/codenames/model-presets";
import { getModelCatalog, supportsToolCalling } from "../src/lib/server/model-catalog";
import { createOpenRouterAgentAdapter } from "../src/lib/server/codenames/agents";
import { GameOrchestrator } from "../src/lib/server/codenames/orchestrator";
import { resolveOpenRouterKey } from "../src/lib/server/openrouter";
import type { Seat, SeatConfig, StoredGameEvent } from "../src/lib/codenames/types";

function loadLocalEnv(): void {
  for (const file of [".env.local", ".env"]) {
    try {
      const text = readFileSync(resolve(process.cwd(), file), "utf8");
      for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;
        const separator = line.indexOf("=");
        if (separator <= 0) continue;
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
        if (key && process.env[key] === undefined) process.env[key] = value;
      }
    } catch {
      // File not present: env vars may still come from the shell.
    }
  }
}

loadLocalEnv();

function arg(name: string): string | undefined {
  const flag = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(flag));
  if (inline) return inline.slice(flag.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

function numberArg(name: string, fallback: number): number {
  const raw = arg(name);
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function printEvent(event: StoredGameEvent) {
  switch (event.type) {
    case "game_started":
      console.log(
        `\nPartida ${event.data.seed} · empieza ${teamLabel(event.data.startingTeam)} · ${ES_WORDS.length} palabras disponibles`,
      );
      break;
    case "turn_started":
      console.log(`\n—— Turno ${event.data.turn}: ${teamLabel(event.data.team)} ——`);
      break;
    case "clue_given":
      console.log(
        `Jefe ${teamLabel(teamOfSeat(event.seat))}: «${event.data.word}» ${event.data.number}${
          event.meta?.reasoning ? `  (${event.meta.reasoning.slice(0, 160)})` : ""
        }`,
      );
      break;
    case "guess_made":
      console.log(
        `Agente ${teamLabel(teamOfSeat(event.seat))}: «${event.data.word}» → ${event.data.result} (quedan ${event.data.guessesLeft})`,
      );
      break;
    case "turn_ended":
      console.log(
        `Fin del turno: ${event.data.reason}${
          event.data.nextTeam ? `; siguiente: ${teamLabel(event.data.nextTeam)}` : ""
        }`,
      );
      break;
    case "agent_error":
      console.log(
        `⚠ Error (${event.data.code}): ${event.data.message} [intentos restantes: ${event.data.attemptsLeft}]`,
      );
      break;
    case "game_paused":
      console.log(`⏸ Pausa (${event.data.reason})${event.data.message ? `: ${event.data.message}` : ""}`);
      break;
    case "game_resumed":
      console.log("▶ Reanudada");
      break;
    case "game_over":
      console.log(
        `\n🏁 ${
          event.data.winner === "draw"
            ? "Tablas"
            : event.data.winner
              ? `Gana ${teamLabel(event.data.winner)}`
              : "Sin ganador"
        } · ${event.data.reason} · ${event.data.turnsPlayed} turnos`,
      );
      break;
    case "thinking":
    case "control_changed":
      break;
  }
}

async function main() {
  const apiKey = resolveOpenRouterKey();
  if (!apiKey) {
    console.error(
      "Falta OPENROUTER_API_KEY. Defínela en .env.local o exporta la variable y vuelve a intentarlo.",
    );
    process.exitCode = 1;
    return;
  }

  const catalog = await getModelCatalog();
  const toolModels = catalog.models
    .filter(supportsToolCalling)
    .filter((model) => model.pricing.prompt >= 0 && model.pricing.completion >= 0)
    .sort(
      (a, b) =>
        a.pricing.prompt * 1_000_000 +
        a.pricing.completion * 1_000_000 -
        (b.pricing.prompt * 1_000_000 + b.pricing.completion * 1_000_000),
    );
  const fallbackModel =
    toolModels.find((model) => model.id === DEFAULT_CODENAMES_MODEL_ID) ??
    toolModels[0];
  if (!fallbackModel) {
    console.error("No hay modelos con tool calling en el catálogo.");
    process.exitCode = 1;
    return;
  }

  const allModel = arg("model") ?? fallbackModel.id;
  const redModel = arg("red") ?? allModel;
  const blueModel = arg("blue") ?? allModel;
  const spymasterModel = arg("spymaster");
  const operativeModel = arg("operative");
  const seed = numberArg("seed", randomSeed());
  const maxCost = numberArg("max-cost", 1);
  const delay = numberArg("delay", 0);

  const requested = [redModel, blueModel, spymasterModel, operativeModel].filter(
    (value): value is string => Boolean(value),
  );
  const unknown = requested.filter(
    (id) => catalog.models.length > 0 && !catalog.models.some((model) => model.id === id),
  );
  if (unknown.length > 0) {
    console.warn(
      `Aviso: estos modelos no están en el catálogo actual: ${unknown.join(", ")}`,
    );
  }

  const seats = Object.fromEntries(
    SEATS.map((seat) => {
      const team = seat.startsWith("red") ? "red" : "blue";
      const role = seat.endsWith("spymaster")
        ? spymasterModel ?? (team === "red" ? redModel : blueModel)
        : operativeModel ?? (team === "red" ? redModel : blueModel);
      return [
        seat,
        {
          seat,
          modelId: role,
          temperature: seat.endsWith("spymaster") ? 0.7 : 0.3,
          avatarId: seat,
          displayName: seat,
        },
      ];
    }),
  ) as Record<Seat, SeatConfig>;

  const notToolCapable = requested
    .map((id) => catalog.models.find((model) => model.id === id))
    .filter((model) => model !== undefined && !supportsToolCalling(model));
  if (notToolCapable.length > 0) {
    console.error(
      `Estos modelos no admiten tool calling: ${notToolCapable
        .map((model) => model?.id)
        .join(", ")}`,
    );
    process.exitCode = 1;
    return;
  }

  const adapter = createOpenRouterAgentAdapter({
    apiKey,
    models: catalog.models,
    timeoutMs: 60_000,
    maxTokens: 2000,
  });

  const game = new GameOrchestrator({
    gameId: `cli-${Date.now()}`,
    seed,
    seats,
    adapter,
    baseDelayMs: delay,
    maxCostUsd: maxCost > 0 ? maxCost : null,
    hooks: {
      onEvent: (event) => printEvent(event),
    },
  });

  console.log(
    `Modelos · rojo: ${redModel} · azul: ${blueModel}${spymasterModel ? ` · jefes: ${spymasterModel}` : ""}${operativeModel ? ` · agentes: ${operativeModel}` : ""}`,
  );
  console.log(
    `Ejemplos baratos: ${CODENAMES_EXAMPLE_MODELS.map((model) => `${model.id} (${model.note})`).join(" · ")}`,
  );
  console.log(`Semilla: ${seed} · tope de coste: $${maxCost.toFixed(2)}`);

  const watchdog = setInterval(() => {
    if (game.paused && game.fatalError) {
      console.error(`\nError fatal: ${game.fatalError}`);
      game.abort();
    }
  }, 250);

  const onSignal = () => {
    console.log("\nCancelando…");
    game.abort();
  };
  process.once("SIGINT", onSignal);

  try {
    const state = await game.run();
    console.log(
      `\nEstado final: ${state.status} · coste estimado: $${game.costUsd.toFixed(4)} · eventos: ${game.events.length}`,
    );
  } finally {
    clearInterval(watchdog);
    process.removeListener("SIGINT", onSignal);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
