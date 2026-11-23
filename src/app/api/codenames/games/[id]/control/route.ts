import type { NextRequest } from "next/server";
import { parseClientId, parseControl } from "@/lib/codenames/validation";
import { getModelCatalog } from "@/lib/server/model-catalog";
import { resolveProviderKeys } from "@/lib/server/provider-keys";
import { controlGame } from "@/lib/server/codenames/runtime";
import { apiText, localeFromHeaders } from "@/lib/codenames/api-messages";

function jsonError(message: string, code: string, status: number) {
  return Response.json({ error: { message, code } }, { status });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const locale = localeFromHeaders(request.headers);
  const text = apiText(locale);

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonError(text.badBody, "bad_request", 400);
  }

  const parsed = parseControl(rawBody, locale);
  if (!parsed.ok) {
    return jsonError(parsed.message, "invalid_control", 400);
  }

  const keys = resolveProviderKeys(request.headers);
  const models =
    parsed.action === "resume" ? (await getModelCatalog()).models : undefined;

  const result = await controlGame(id, parsed.action, {
    speed: parsed.speed,
    keys,
    models,
    clientId: parseClientId(request.headers.get("x-client-id")),
  });

  if (!result.ok) {
    const code = result.code ?? "control_failed";
    return jsonError(text.codes[code] ?? result.message ?? text.controlFailed, code, 409);
  }

  return Response.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}
