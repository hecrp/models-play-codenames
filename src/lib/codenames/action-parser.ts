import type { GameAction, Language, OracleErrorCode } from "./types";
import { gameText } from "./messages";

export type ToolParseResult =
  /** `salvaged`: the arguments were broken JSON and complete fields were rescued. */
  | { ok: true; action: GameAction; salvaged?: boolean }
  | { ok: false; code: OracleErrorCode; message: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asWord(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const word = value.trim();
  return word ? word : null;
}

const NUMBER_WORDS: Record<string, number> = {
  cero: 0, zero: 0, ninguna: 0, ninguno: 0,
  uno: 1, una: 1, one: 1,
  dos: 2, two: 2,
  tres: 3, three: 3,
  cuatro: 4, four: 4,
  cinco: 5, five: 5,
  seis: 6, six: 6,
  siete: 7, seven: 7,
  ocho: 8, eight: 8,
  nueve: 9, nine: 9,
};

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? value : null;
  }
  if (typeof value !== "string") return null;
  const text = value.trim().toLowerCase();
  // Accept "2", "2.0", "2 cartas" or a number written as a word.
  const digits = /^(-?\d+)(?:\.0+)?\b/.exec(text);
  if (digits) return Number(digits[1]);
  const word = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/\s+/)[0];
  return word in NUMBER_WORDS ? NUMBER_WORDS[word] : null;
}

/** Models sometimes rename the field or glue the number to the word ("MAR 2"). */
function clueNumber(args: Record<string, unknown>, word: string | null) {
  for (const key of ["number", "numero", "número", "count", "num", "n"]) {
    if (key in args) {
      const value = asNumber(args[key]);
      if (value !== null) return { number: value, word };
    }
  }
  const glued = word ? /^(\p{L}+)[\s:,·-]+(\d)$/u.exec(word) : null;
  if (glued) return { number: Number(glued[2]), word: glued[1] };
  return { number: null, word };
}

function asReasoning(value: unknown): string | undefined {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 300)
    : undefined;
}

/**
 * Private clue targets. Accepts an array or a comma-separated string, and the
 * Spanish field name some models translate the schema into.
 */
function asTargets(args: Record<string, unknown>): string[] | undefined {
  const raw = args.targets ?? args.objetivos ?? args.target_words;
  const values = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(/[,;]/)
      : null;
  if (!values) return undefined;
  return values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 9);
}

/** Table talk: shown to everyone, so it is clamped and whitespace-collapsed. */
export function asSay(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, 180) : undefined;
}

const STRING_FIELDS = ["word", "palabra", "say", "reasoning"];
const NUMBER_FIELDS = ["number", "numero", "número", "count", "num", "n"];

/**
 * Rescue the complete fields of broken tool arguments: JSON cut off by the
 * token limit, or a provider's own markup leaking into it. Only fields whose
 * value is fully present are kept; returns null when nothing is usable.
 */
export function salvageArguments(raw: string): Record<string, unknown> | null {
  const result: Record<string, unknown> = {};
  for (const field of STRING_FIELDS) {
    const match = new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(raw);
    if (!match) continue;
    try {
      result[field] = JSON.parse(`"${match[1]}"`);
    } catch {
      // Broken escape sequence: skip the field.
    }
  }
  for (const field of NUMBER_FIELDS) {
    const match = new RegExp(`"${field}"\\s*:\\s*"?(-?\\d+)`).exec(raw);
    if (match) {
      result[field] = Number(match[1]);
      break;
    }
  }
  const targets = /"(?:targets|objetivos)"\s*:\s*(\[[^\]]*\])/.exec(raw);
  if (targets) {
    try {
      result.targets = JSON.parse(targets[1]);
    } catch {
      // Incomplete list: drop it, targets are private and optional to the engine.
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Some providers answer a forced tool call with the arguments as plain text,
 * often inside a ```json fence. Returns the first JSON object found, or the
 * salvaged fields of a broken one.
 */
export function extractJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  const end = text.lastIndexOf("}");
  if (end > start) {
    try {
      const parsed: unknown = JSON.parse(text.slice(start, end + 1));
      const record = asRecord(parsed);
      if (record) return record;
    } catch {
      // Fall through to salvage.
    }
  }
  return salvageArguments(text.slice(start));
}

/**
 * Convert a tool call from any provider into the engine's strict action shape.
 * The engine still performs the semantic validation (board words, ranges...).
 */
export function parseToolCall(
  rawName: string,
  rawArguments: unknown,
  lang: Language = "es",
): ToolParseResult {
  const text = gameText(lang);
  // Some models (gpt-oss, Harmony format) prefix the namespace: functions.give_clue.
  const name = rawName.trim().replace(/^functions[.:]/, "");
  let argumentsValue = rawArguments;
  let salvaged = false;
  if (typeof rawArguments === "string") {
    try {
      argumentsValue = JSON.parse(rawArguments);
    } catch {
      // Truncated output or provider markup mid-JSON: keep the complete fields.
      const rescued = salvageArguments(rawArguments);
      if (!rescued) {
        return {
          ok: false,
          code: "invalid_action",
          message: text.argsNotJson,
        };
      }
      argumentsValue = rescued;
      salvaged = true;
    }
  }

  const args = asRecord(argumentsValue);
  if (!args) {
    return {
      ok: false,
      code: "invalid_action",
      message: text.argsNotObject,
    };
  }

  if (name === "give_clue") {
    const { number, word } = clueNumber(args, asWord(args.word));
    if (!word) {
      return {
        ok: false,
        code: "invalid_action",
        message: text.clueNeedsWord,
      };
    }
    if (number === null) {
      const received = JSON.stringify(args.number ?? null).slice(0, 40);
      return {
        ok: false,
        code: "invalid_action",
        message: text.clueNeedsNumber(received),
      };
    }
    return {
      ok: true,
      ...(salvaged ? { salvaged } : {}),
      action: {
        type: "give_clue",
        word,
        number,
        ...(asTargets(args) ? { targets: asTargets(args) } : {}),
        ...(asReasoning(args.reasoning)
          ? { reasoning: asReasoning(args.reasoning) }
          : {}),
        ...(asSay(args.say) ? { say: asSay(args.say) } : {}),
      },
    };
  }

  if (name === "guess") {
    const word = asWord(args.word);
    if (!word) {
      return {
        ok: false,
        code: "invalid_action",
        message: text.guessNeedsWord,
      };
    }
    return {
      ok: true,
      ...(salvaged ? { salvaged } : {}),
      action: {
        type: "guess",
        word,
        ...(asReasoning(args.reasoning)
          ? { reasoning: asReasoning(args.reasoning) }
          : {}),
        ...(asSay(args.say) ? { say: asSay(args.say) } : {}),
      },
    };
  }

  if (name === "stop") {
    return {
      ok: true,
      ...(salvaged ? { salvaged } : {}),
      action: {
        type: "stop",
        ...(asReasoning(args.reasoning)
          ? { reasoning: asReasoning(args.reasoning) }
          : {}),
        ...(asSay(args.say) ? { say: asSay(args.say) } : {}),
      },
    };
  }

  return {
    ok: false,
    code: "invalid_action",
    message: text.unknownTool(name),
  };
}
