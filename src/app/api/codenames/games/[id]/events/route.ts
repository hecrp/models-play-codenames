import { connection } from "next/server";
import type { NextRequest } from "next/server";
import { getEvents, getGame } from "@/lib/server/codenames/store";
import { hasRuntime, subscribe } from "@/lib/server/codenames/runtime";
import { needsRedaction, redactEvent } from "@/lib/server/codenames/human";
import { apiText, localeFromHeaders } from "@/lib/codenames/api-messages";
import type { StoredGameEvent } from "@/lib/codenames/types";

export const maxDuration = 300;

const encoder = new TextEncoder();

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

  const headerId = request.headers.get("last-event-id");
  const queryId = request.nextUrl.searchParams.get("lastEventId");
  const requested = Number(headerId ?? queryId ?? 0);
  const after = Number.isFinite(requested) && requested > 0 ? requested : 0;

  let closed = false;
  let lastSent = after;
  let unsubscribe: () => void = () => {};
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;

  const write = (chunk: string) => {
    if (closed || !controllerRef) return;
    try {
      controllerRef.enqueue(encoder.encode(chunk));
    } catch {
      closed = true;
    }
  };

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
    unsubscribe();
    try {
      controllerRef?.close();
    } catch {
      // Already closed by the client.
    }
  };

  const redact = needsRedaction(game.config, game.status);
  const sendEvent = (event: StoredGameEvent) => {
    if (event.id <= lastSent) return;
    lastSent = event.id;
    const payload = redact ? redactEvent(event) : event;
    write(`id: ${event.id}\ndata: ${JSON.stringify(payload)}\n\n`);
    if (event.type === "game_over") {
      setTimeout(cleanup, 20);
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
      write("retry: 2000\n\n");

      const buffer: StoredGameEvent[] = [];
      let live = false;
      unsubscribe = subscribe(id, (event) => {
        if (live) sendEvent(event);
        else buffer.push(event);
      });

      const replay = getEvents(id, after);
      for (const event of replay) sendEvent(event);

      live = true;
      for (const event of buffer) sendEvent(event);

      const current = getGame(id);
      if (
        !hasRuntime(id) ||
        !current ||
        current.status === "finished" ||
        current.status === "aborted"
      ) {
        write(": stream-end\n\n");
        cleanup();
        return;
      }

      heartbeat = setInterval(() => write(": ping\n\n"), 15_000);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
