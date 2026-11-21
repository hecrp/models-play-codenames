import type { StoredGameEvent } from "@/lib/codenames/types";
import type { GameRecord } from "./store";
import demoEn1 from "@/lib/codenames/demo/demo-en-1.json";
import demoEn2 from "@/lib/codenames/demo/demo-en-2.json";
import demoEn3 from "@/lib/codenames/demo/demo-en-3.json";
import demoEs1 from "@/lib/codenames/demo/demo-es-1.json";
import demoEs2 from "@/lib/codenames/demo/demo-es-2.json";
import demoEs3 from "@/lib/codenames/demo/demo-es-3.json";

/**
 * Real games played by models, bundled so anyone can watch one right after
 * cloning, without an API key or any cost. They are served through the normal
 * replay routes under the ids in `DEMO_GAME_IDS` and never touch the database.
 */
interface DemoGame {
  game: GameRecord;
  events: StoredGameEvent[];
}

const DEMOS: Record<string, DemoGame> = Object.fromEntries(
  [demoEs1, demoEs2, demoEs3, demoEn1, demoEn2, demoEn3].map((raw) => {
    const demo = raw as unknown as DemoGame;
    return [demo.game.id, demo];
  }),
);

export function isDemoGameId(id: string): boolean {
  return Object.hasOwn(DEMOS, id);
}

export function getDemoGame(id: string): GameRecord | null {
  return isDemoGameId(id) ? DEMOS[id].game : null;
}

export function getDemoEvents(id: string, after = 0): StoredGameEvent[] {
  return isDemoGameId(id) ? DEMOS[id].events.filter((event) => event.id > after) : [];
}
