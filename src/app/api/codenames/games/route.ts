import { connection } from "next/server";
import type { NextRequest } from "next/server";
import { getModelCatalog, supportsToolCalling } from "@/lib/server/model-catalog";
import {
  activeGameCount,
  startGame,
} from "@/lib/server/codenames/runtime";
import { resolveOpenRouterKey } from "@/lib/server/openrouter";
import {
  parseClientId,
  parseGameConfig,
} from "@/lib/codenames/validation";
import { listGames } from "@/lib/server/codenames/store";
import { SEATS } from "@/lib/codenames/seats";
import { apiText, localeFromHeaders } from "@/lib/codenames/api-messages";

export const maxDuration = 300;

function jsonError(message: string, code: string, status: number) {
  return Response.json({ error: { message, code } }, { status });
}

export async function POST(request: NextRequest) {
  const locale = localeFromHeaders(request.headers);
  const text = apiText(locale);
  const apiKey = resolveOpenRouterKey(
    request.headers.get("x-openrouter-key"),
  );
  if (!apiKey) {
    return jsonError(text.missingApiKey, "missing_api_key", 401);
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonError(text.badBody, "bad_request", 400);
  }

  const parsed = parseGameConfig(rawBody, locale);
  if (!parsed.ok) {
    return jsonError(parsed.message, "invalid_config", 400);
  }

  const clientId = parseClientId(request.headers.get("x-client-id"));
  const maxActive = Math.max(
    1,
    Number(process.env.CODENAMES_MAX_ACTIVE ?? 2) || 2,
  );
  if (activeGameCount(clientId) >= maxActive) {
    return jsonError(text.tooManyGames(maxActive), "too_many_games", 429);
  }

  const catalog = await getModelCatalog();
  for (const seat of SEATS) {
    if (parsed.config.seats[seat].human) continue;
    const modelId = parsed.config.seats[seat].modelId;
    const model = catalog.models.find((candidate) => candidate.id === modelId);
    if (model && !supportsToolCalling(model)) {
      return jsonError(
        text.modelWithoutTools(model.name, seat),
        "model_without_tools",
        400,
      );
    }
    if (!model && catalog.source === "openrouter") {
      return jsonError(text.unknownModel(modelId), "unknown_model", 400);
    }
  }

  const gameId = `g_${crypto.randomUUID()}`;
  try {
    const record = await startGame({
      id: gameId,
      clientId,
      config: parsed.config,
      apiKey,
      models: catalog.models,
    });
    return Response.json(
      {
        gameId,
        state: record.state,
        status: record.status,
        config: record.config,
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[codenames] Could not create the game:", error);
    return jsonError(text.createFailed, "create_failed", 500);
  }
}

export async function GET(request: NextRequest) {
  // Cache Components: the list must be read at request time.
  await connection();
  const limit = Number(request.nextUrl.searchParams.get("limit") ?? 30);
  const games = listGames({
    limit: Number.isFinite(limit) ? limit : 30,
  });
  return Response.json(
    { games },
    { headers: { "Cache-Control": "no-store" } },
  );
}
