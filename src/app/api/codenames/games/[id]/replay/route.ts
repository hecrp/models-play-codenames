import { connection } from "next/server";
import type { NextRequest } from "next/server";
import { getEvents, getGame } from "@/lib/server/codenames/store";
import { needsRedaction, redactEvent, redactState } from "@/lib/server/codenames/human";
import { apiText, localeFromHeaders } from "@/lib/codenames/api-messages";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  await connection();
  const { id } = await context.params;
  const game = getGame(id);
  if (!game) {
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

  const redact = needsRedaction(game.config, game.status);
  const events = redact ? getEvents(id, 0).map(redactEvent) : getEvents(id, 0);
  const payload = {
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
      finishedAt: game.finishedAt,
      seq: game.seq,
    },
    events,
  };

  if (request.nextUrl.searchParams.get("format") === "jsonl") {
    const lines = events
      .map((event) => JSON.stringify(event))
      .join("\n");
    return new Response(`${lines}\n`, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Content-Disposition": `attachment; filename="codenames-${id}.jsonl"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return Response.json(payload, {
    headers: { "Cache-Control": "no-store" },
  });
}
