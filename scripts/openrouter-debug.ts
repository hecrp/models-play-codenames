import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createGame } from "../src/lib/codenames/engine";
import { spymasterSeat } from "../src/lib/codenames/seats";
import { viewFor } from "../src/lib/codenames/view";
import { buildAgentPrompt } from "../src/lib/codenames/prompts";
import { toolChoiceForSeat, toolsForSeat } from "../src/lib/codenames/tools";

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
        const value = line
          .slice(separator + 1)
          .trim()
          .replace(/^["']|["']$/g, "");
        if (key && process.env[key] === undefined) process.env[key] = value;
      }
    } catch {
      // ignore
    }
  }
}

loadLocalEnv();

const model = process.argv[2] ?? "openai/gpt-oss-20b";
const key = process.env.OPENROUTER_API_KEY?.trim();
if (!key) {
  console.error("Falta OPENROUTER_API_KEY");
  process.exit(1);
}

const created = createGame({ id: "debug", seed: 7, createdAt: 1 });
const seat = spymasterSeat(created.state.turn.team);
const view = viewFor(seat, created.state, []);
const { system, user } = buildAgentPrompt(seat, view);

const base = {
  model,
  messages: [
    { role: "system", content: system },
    { role: "user", content: user },
  ],
  tools: toolsForSeat(seat),
  tool_choice: toolChoiceForSeat(seat),
  max_tokens: 400,
  temperature: 0.7,
  stream: false,
  usage: { include: true },
};

const variants: Array<{ name: string; body: Record<string, unknown> }> = [
  { name: "exacto 400", body: base },
  {
    name: "exacto 2000",
    body: { ...base, max_tokens: 2000 },
  },
  {
    name: "exacto 4000",
    body: { ...base, max_tokens: 4000 },
  },
  {
    name: "auto 2000",
    body: { ...base, max_tokens: 2000, tool_choice: "auto" },
  },
  {
    name: "auto 4000",
    body: { ...base, max_tokens: 4000, tool_choice: "auto" },
  },
  {
    name: "forced effort low 2000",
    body: {
      ...base,
      max_tokens: 2000,
      reasoning: { effort: "low", exclude: false },
    },
  },
  {
    name: "forced exclude reasoning 2000",
    body: {
      ...base,
      max_tokens: 2000,
      reasoning: { exclude: true },
    },
  },
];

async function main() {
  console.log(`Modelo: ${model}`);
  console.log(`tools: ${JSON.stringify(base.tools.map((tool) => tool.function.name))}`);
  console.log(`tool_choice: ${JSON.stringify(base.tool_choice)}`);
  console.log(`system prompt chars: ${system.length}; user chars: ${user.length}`);
  console.log("");

  for (const variant of variants) {
    const body = Object.fromEntries(
      Object.entries(variant.body).filter(([, value]) => value !== undefined),
    );
    const started = Date.now();
    try {
      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
            "HTTP-Referer":
              process.env.OPENROUTER_SITE_URL ?? "http://localhost:3000",
            "X-Title": process.env.OPENROUTER_SITE_NAME ?? "OpenChat",
          },
          body: JSON.stringify(body),
        },
      );
      const text = await response.text();
      console.log(
        `--- ${variant.name}: ${response.status} ${response.statusText} (${Date.now() - started} ms)`,
      );
      console.log(text.slice(0, 1200));
      console.log("");
    } catch (error) {
      console.log(
        `--- ${variant.name}: ERROR ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}

void main();
