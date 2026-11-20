import { connection } from "next/server";
import { getModelCatalog } from "@/lib/server/model-catalog";
import type { ModelsResponse } from "@/lib/types";

export async function GET() {
  // Cache Components: force a request-time read instead of prerendering.
  await connection();

  const catalog = await getModelCatalog();
  const hasServerKey = Boolean(process.env.OPENROUTER_API_KEY?.trim());

  return Response.json(
    {
      models: catalog.models,
      source: catalog.source,
      hasServerKey,
      fetchedAt: catalog.fetchedAt,
      ...(catalog.warning ? { warning: catalog.warning } : {}),
    } satisfies ModelsResponse,
    { headers: { "Cache-Control": "no-store" } },
  );
}
