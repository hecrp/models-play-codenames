import { roleOfSeat } from "./seats";
import type { AgentView, Language, Seat } from "./types";

export interface FunctionTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

const DESCRIPTIONS = {
  es: {
    reasoning:
      "Razonamiento privado breve (opcional). Nunca se envía a los demás modelos ni se muestra como diálogo.",
    say: "OBLIGATORIO. Una frase corta (máx. 180 caracteres) de charla de mesa, en español y en primera persona, que acompañe a tu jugada: cómo te suena la pista, qué dudas tienes, qué intentas o cómo provocas al rival. Se muestra en pantalla y los demás jugadores la leen. Nunca reveles colores ocultos, el asesino ni información privada.",
    giveClue:
      "Da una pista de Codenames: una sola palabra y un número del 0 al 9, acompañada de una frase breve de charla.",
    clueWord:
      "Una sola palabra en español, sin espacios ni guiones, relacionada por significado con tus cartas. No puede ser una carta sin revelar, ni una forma suya (plural, derivado) ni una palabra compuesta que la incluya.",
    clueNumber:
      "Número de cartas propias relacionadas con la pista. 0 significa 'ninguna de las nuestras' y da intentos sin límite.",
    guess:
      "Revela una carta del tablero que todavía no esté revelada. Solo una por llamada, con una frase breve de charla.",
    guessWord: "Palabra exacta de una carta sin revelar.",
    stop: "El agente se planta y termina el turno sin revelar más cartas. Acompáñalo de una frase breve de charla.",
  },
  en: {
    reasoning:
      "Short private reasoning (optional). It is never sent to the other models nor shown as dialogue.",
    say: "REQUIRED. A short line (max 180 characters) of table talk, in English and in first person, to go with your move: how the clue sounds to you, what you doubt, what you are trying or how you tease the rival. It is shown on screen and read by the other players. Never reveal hidden colors, the assassin or private information.",
    giveClue:
      "Give a Codenames clue: one single word and a number from 0 to 9, with a short line of table talk.",
    clueWord:
      "One single English word, without spaces or hyphens, related by meaning to your cards. It cannot be an unrevealed card, a form of one (plural, derived word) or a compound word that includes one.",
    clueNumber:
      "Number of your own cards related to the clue. 0 means 'none of ours' and gives unlimited guesses.",
    guess:
      "Reveal a card on the board that is not revealed yet. Only one per call, with a short line of table talk.",
    guessWord: "Exact word of an unrevealed card.",
    stop: "The operative stops and ends the turn without revealing more cards. Add a short line of table talk.",
  },
} satisfies Record<Language, Record<string, string>>;

function buildTools(lang: Language) {
  const d = DESCRIPTIONS[lang];
  const reasoning = { type: "string", maxLength: 300, description: d.reasoning };
  const say = { type: "string", maxLength: 180, description: d.say };

  const giveClue: FunctionTool = {
    type: "function",
    function: {
      name: "give_clue",
      description: d.giveClue,
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["word", "number"],
        properties: {
          word: { type: "string", description: d.clueWord },
          number: { type: "integer", minimum: 0, maximum: 9, description: d.clueNumber },
          say,
          reasoning,
        },
      },
    },
  };

  const guess = (words?: string[]): FunctionTool => ({
    type: "function",
    function: {
      name: "guess",
      description: d.guess,
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["word"],
        properties: {
          word: {
            type: "string",
            ...(words ? { enum: words } : {}),
            description: d.guessWord,
          },
          say,
          reasoning,
        },
      },
    },
  });

  const stop: FunctionTool = {
    type: "function",
    function: {
      name: "stop",
      description: d.stop,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { say, reasoning },
      },
    },
  };

  return { giveClue, guess, stop };
}

const TOOLS = { es: buildTools("es"), en: buildTools("en") };

export const GIVE_CLUE_TOOL = TOOLS.es.giveClue;

export function toolsForSeat(seat: Seat, view?: AgentView): FunctionTool[] {
  const tools = TOOLS[view?.lang ?? "es"];
  if (roleOfSeat(seat) === "spymaster") return [tools.giveClue];
  const hidden = view?.board.filter((card) => !card.revealed).map((card) => card.word);
  if (!view || !hidden || hidden.length === 0) return [tools.guess(), tools.stop];
  // The first guess of a turn is mandatory, so stop is not offered yet.
  return view.turn.guessesMade === 0 ? [tools.guess(hidden)] : [tools.guess(hidden), tools.stop];
}

export type ToolChoice = "required" | "auto" | {
  type: "function";
  function: { name: string };
};

export function toolChoiceForSeat(seat: Seat): ToolChoice {
  return roleOfSeat(seat) === "spymaster"
    ? { type: "function", function: { name: "give_clue" } }
    : "required";
}
