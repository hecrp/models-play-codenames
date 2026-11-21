import type { Language } from "../types";

/**
 * Ids of the bundled demo games, by language. Each one is a real game between
 * models on its own board; the demo button picks one at random.
 */
export const DEMO_GAME_IDS: Record<Language, readonly string[]> = {
  es: ["demo-es-1", "demo-es-2", "demo-es-3"],
  en: ["demo-en-1", "demo-en-2", "demo-en-3"],
};

export function randomDemoId(lang: Language, avoid?: string | null): string {
  const ids = DEMO_GAME_IDS[lang];
  const pool = ids.length > 1 && avoid ? ids.filter((id) => id !== avoid) : ids;
  return pool[Math.floor(Math.random() * pool.length)];
}
