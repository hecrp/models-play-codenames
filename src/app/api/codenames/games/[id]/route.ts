import { connection } from "next/server";
import type { NextRequest } from "next/server";
import { getGame } from "@/lib/server/codenames/store";
import { needsRedaction, redactState } from "@/lib/server/codenames/human";
import { apiText, localeFromHeaders } from "@/lib/codenames/api-messages";
import {
  getRuntimeStatus,
  hasRuntime,
} from "@/lib/server/codenames/runtime";

function notFound(request: NextRequest) {
  return Response.json(
    {
      error: {
        message: apiText(localeFromHeaders(request.headers)).notFound,
        code: "not_found",
      },
    },
    { status: 404 },
  );
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  await connection();
  const { id } = await context.params;
  const game = getGame(id);
  if (!game) return notFound(request);
  const redact = needsRedaction(game.config, game.status);

  return Response.json(
    {
      game: {
        id: game.id,
        seed: game.seed,
        lang: game.lang,
        config: game.config,
        promptVersion: game.promptVersion,
        status: game.status,
        winner: game.winner,
        winReason: game.winReason,
        state: redact ? redactState(game.state) : game.state,
        metrics: game.metrics,
        createdAt: game.createdAt,
        updatedAt: game.updatedAt,
        startedAt: game.startedAt,
        finishedAt: game.finishedAt,
        seq: game.seq,
      },
      runtime: getRuntimeStatus(id),
      hasRuntime: hasRuntime(id),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
