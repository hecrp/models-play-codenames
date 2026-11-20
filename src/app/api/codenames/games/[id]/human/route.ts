import type { NextRequest } from "next/server";
import { parseToolCall } from "@/lib/codenames/action-parser";
import { parseClientId } from "@/lib/codenames/validation";
import { resolveOpenRouterKey } from "@/lib/server/openrouter";
import { resolveHumanGuess, submitHumanAction } from "@/lib/server/codenames/runtime";
import { getGame } from "@/lib/server/codenames/store";
import { apiText, localeFromHeaders } from "@/lib/codenames/api-messages";

function jsonError(message: string, code: string, status: number) {
  return Response.json({ error: { message, code } }, { status });
}

const ACTIONS = new Set(["give_clue", "guess", "stop"]);

/** POST { action: { type, word?, number?, say? } } or { resolve: "texto" }. */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const clientId = parseClientId(request.headers.get("x-client-id"));
  const text = apiText(localeFromHeaders(request.headers));

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError(text.badBody, "bad_request", 400);
  }

  if (typeof body.resolve === "string") {
    const typed = body.resolve.slice(0, 60);
    const result = await resolveHumanGuess(
      id,
      clientId,
      typed,
      resolveOpenRouterKey(request.headers.get("x-openrouter-key")),
    );
    if (!result.ok) {
      return jsonError(text.codes[result.code] ?? result.message, result.code, 409);
    }
    return Response.json(result.resolution, { headers: { "Cache-Control": "no-store" } });
  }

  const raw = body.action;
  const rawType =
    raw && typeof raw === "object" ? (raw as { type?: unknown }).type : undefined;
  const type = typeof rawType === "string" && ACTIONS.has(rawType) ? rawType : undefined;
  if (!type) return jsonError(text.invalidAction, "invalid_action", 400);

  const parsed = parseToolCall(type, raw, getGame(id)?.config.lang);
  if (!parsed.ok) return jsonError(parsed.message, parsed.code, 400);

  const result = submitHumanAction(id, clientId, parsed.action);
  if (!result.ok) {
    return jsonError(text.codes[result.code] ?? result.message, result.code, 409);
  }
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
