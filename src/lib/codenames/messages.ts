import type { GameOverReason, GuessResult, Language, Team, TurnEndReason } from "./types";

/**
 * Every text the server produces during a game (arbiter errors, history, tool
 * feedback). It is stored in the event log, so it follows the game language.
 */
const ES = {
  team: { red: "rojo", blue: "azul" } satisfies Record<Team, string>,

  clueNotSingleWord: "La pista debe ser una sola palabra, sin espacios ni guiones.",
  numberRange: (min: number, max: number) => `El número debe ser un entero entre ${min} y ${max}.`,
  clueOnBoard: (word: string) => `«${word}» está en el tablero y no puede aparecer en la pista.`,
  gameOver: "La partida ya ha terminado.",
  notTeamTurn: (team: string) => `No es el turno del equipo ${team}.`,
  onlySpymasterClues: "Solo el jefe de espías puede dar una pista.",
  clueAtTurnStart: "La pista solo se puede dar al inicio del turno.",
  onlyOperativeGuesses: "Solo el agente puede adivinar cartas.",
  noClueYet: "Todavía no hay una pista que adivinar.",
  notOnBoard: (word: string) => `«${word}» no está en el tablero.`,
  alreadyRevealed: (word: string) => `«${word}» ya está revelada.`,
  onlyOperativeStops: "Solo el agente puede plantarse.",
  stopAfterClue: "El agente solo puede plantarse tras una pista.",
  mustGuess: "Debes intentar al menos una carta en cada turno antes de plantarte.",
  unknownAction: "Acción desconocida.",

  argsNotJson: "Los argumentos de la herramienta no son JSON válido.",
  argsNotObject: "La herramienta no recibió un objeto de argumentos.",
  clueNeedsWord: "give_clue necesita un campo word con una palabra.",
  clueNeedsNumber: (received: string) =>
    `give_clue necesita un campo number entero entre 0 y 9 (recibido: ${received}). Ejemplo: {"word": "OCÉANO", "number": 2, "say": "…"}.`,
  guessNeedsWord: "guess necesita un campo word con una palabra.",
  unknownTool: (name: string) => `Herramienta desconocida: ${name}.`,

  noToolCalling: (model: string) =>
    `El modelo ${model} no admite tool calling; elige otro para este asiento.`,
  callCancelled: "La llamada al modelo se canceló.",
  unknownModelError: "Error desconocido al llamar al modelo.",
  noToolCall: "El modelo no llamó a ninguna herramienta. Responde únicamente con la herramienta indicada.",
  textReceived: (text: string) => ` Texto recibido: ${text}`,
  multipleToolCalls: "El modelo llamó a varias herramientas en la misma acción.",
  spymasterMustClue: "El jefe de espías debe usar give_clue.",
  operativeMustGuess: "El agente debe usar guess o stop.",
  adapterFailed: "El adaptador del modelo falló.",
  noAction: "El modelo no devolvió ninguna acción.",
  gameAborted: "Partida abortada.",
  notYourTurn: "Todavía no es tu turno.",

  upstream: {
    unauthorized: "La API key de OpenRouter no es válida. Revísala en Ajustes.",
    noCredit: "OpenRouter no tiene saldo suficiente para este modelo. Añade crédito o elige otro modelo.",
    rateLimited: "Demasiadas peticiones a OpenRouter. Espera unos segundos y vuelve a intentarlo.",
    notFound: "Ese modelo no está disponible en OpenRouter ahora mismo.",
    serverError: (status: number) => `OpenRouter está teniendo problemas (${status}). Inténtalo de nuevo.`,
    rejected: (status: number) => `OpenRouter rechazó la petición (${status}).`,
    timeout: (seconds: number) => `La llamada superó el tiempo máximo de ${seconds} s.`,
    unreachable: "No se pudo contactar con OpenRouter.",
    notJson: "OpenRouter devolvió una respuesta que no es JSON.",
    noKey: "No hay ninguna API key de OpenRouter configurada.",
    cancelled: "Petición cancelada.",
  },

  history: {
    result: {
      own: "era de su equipo",
      opponent: "era del rival",
      neutral: "era neutral",
      assassin: "¡era el asesino!",
    } satisfies Record<GuessResult, string>,
    started: (team: string) => `Comienza la partida. Empieza el equipo ${team}.`,
    turn: (turn: number, team: string) => `Turno ${turn}: equipo ${team}.`,
    clue: (team: string, quote: string, word: string, number: number) =>
      `Jefe ${team}:${quote} Pista «${word}» ${number}.`,
    guess: (team: string, quote: string, word: string, result: string) =>
      `Agente ${team}:${quote} revela «${word}» (${result}).`,
    turnEnd: (reason: string) => `Fin del turno: ${reason}.`,
    says: (text: string) => `Dice: «${text}»`,
    endReasons: {
      stopped: "el agente se planta",
      guesses_exhausted: "se agotan los intentos",
      opponent_card: "carta del rival",
      neutral_card: "carta neutral",
      assassin: "asesino",
      clue_failed: "pista fallida",
      attempts_exhausted: "intentos agotados",
      turn_limit: "límite de turnos",
    } satisfies Record<TurnEndReason, string>,
    seatError: (seat: string, code: string, message: string) =>
      `Fallo del asiento ${seat} (${code}): ${message}`,
    draw: "Tablas por límite de turnos.",
    winner: (team: string, reason: GameOverReason) => `Gana el equipo ${team} (${reason}).`,
    noWinner: (reason: GameOverReason) => `Partida sin ganador (${reason}).`,
  },

  resolver: {
    tool: "Devuelve la carta que la persona quería escribir.",
    system: (none: string) =>
      `Una persona juega a Codenames y ha escrito el nombre de una carta, quizá con erratas, sin tildes, en plural o abreviado. Elige la carta de la lista que quería escribir. Si no está claro o podría ser más de una, responde ${none}.`,
    user: (cards: string, text: string) => `Cartas disponibles: ${cards}\nTexto escrito: «${text}»`,
  },
};

type GameText = typeof ES;

const EN: GameText = {
  team: { red: "red", blue: "blue" },

  clueNotSingleWord: "The clue must be a single word, without spaces or hyphens.",
  numberRange: (min, max) => `The number must be an integer between ${min} and ${max}.`,
  clueOnBoard: (word) => `"${word}" is on the board and cannot appear in the clue.`,
  gameOver: "The game is already over.",
  notTeamTurn: (team) => `It is not the ${team} team's turn.`,
  onlySpymasterClues: "Only the spymaster can give a clue.",
  clueAtTurnStart: "A clue can only be given at the start of the turn.",
  onlyOperativeGuesses: "Only the operative can guess cards.",
  noClueYet: "There is no clue to guess yet.",
  notOnBoard: (word) => `"${word}" is not on the board.`,
  alreadyRevealed: (word) => `"${word}" is already revealed.`,
  onlyOperativeStops: "Only the operative can stop.",
  stopAfterClue: "The operative can only stop after a clue.",
  mustGuess: "You must guess at least one card each turn before stopping.",
  unknownAction: "Unknown action.",

  argsNotJson: "The tool arguments are not valid JSON.",
  argsNotObject: "The tool did not receive an arguments object.",
  clueNeedsWord: "give_clue needs a word field with one word.",
  clueNeedsNumber: (received) =>
    `give_clue needs an integer number field between 0 and 9 (received: ${received}). Example: {"word": "OCEAN", "number": 2, "say": "…"}.`,
  guessNeedsWord: "guess needs a word field with one word.",
  unknownTool: (name) => `Unknown tool: ${name}.`,

  noToolCalling: (model) => `The model ${model} does not support tool calling; pick another one for this seat.`,
  callCancelled: "The model call was cancelled.",
  unknownModelError: "Unknown error while calling the model.",
  noToolCall: "The model did not call any tool. Answer only with the indicated tool.",
  textReceived: (text) => ` Text received: ${text}`,
  multipleToolCalls: "The model called several tools in the same action.",
  spymasterMustClue: "The spymaster must use give_clue.",
  operativeMustGuess: "The operative must use guess or stop.",
  adapterFailed: "The model adapter failed.",
  noAction: "The model returned no action.",
  gameAborted: "Game aborted.",
  notYourTurn: "It is not your turn yet.",

  upstream: {
    unauthorized: "The OpenRouter API key is not valid. Check it in Settings.",
    noCredit: "OpenRouter does not have enough credit for this model. Add credit or pick another model.",
    rateLimited: "Too many requests to OpenRouter. Wait a few seconds and try again.",
    notFound: "That model is not available on OpenRouter right now.",
    serverError: (status) => `OpenRouter is having problems (${status}). Try again.`,
    rejected: (status) => `OpenRouter rejected the request (${status}).`,
    timeout: (seconds) => `The call exceeded the ${seconds} s time limit.`,
    unreachable: "Could not reach OpenRouter.",
    notJson: "OpenRouter returned a response that is not JSON.",
    noKey: "No OpenRouter API key is configured.",
    cancelled: "Request cancelled.",
  },

  history: {
    result: {
      own: "it was their team's",
      opponent: "it was the rival's",
      neutral: "it was neutral",
      assassin: "it was the assassin!",
    },
    started: (team) => `The game starts. The ${team} team goes first.`,
    turn: (turn, team) => `Turn ${turn}: ${team} team.`,
    clue: (team, quote, word, number) => `Spymaster ${team}:${quote} Clue "${word}" ${number}.`,
    guess: (team, quote, word, result) => `Operative ${team}:${quote} reveals "${word}" (${result}).`,
    turnEnd: (reason) => `End of turn: ${reason}.`,
    says: (text) => `Says: "${text}"`,
    endReasons: {
      stopped: "the operative stops",
      guesses_exhausted: "no guesses left",
      opponent_card: "rival card",
      neutral_card: "neutral card",
      assassin: "assassin",
      clue_failed: "failed clue",
      attempts_exhausted: "attempts exhausted",
      turn_limit: "turn limit",
    },
    seatError: (seat, code, message) => `Seat ${seat} failed (${code}): ${message}`,
    draw: "Draw by turn limit.",
    winner: (team, reason) => `The ${team} team wins (${reason}).`,
    noWinner: (reason) => `Game without a winner (${reason}).`,
  },

  resolver: {
    tool: "Return the card the person meant to type.",
    system: (none) =>
      `A person is playing Codenames and typed the name of a card, maybe with typos, missing accents, in plural or abbreviated. Pick the card from the list they meant. If it is unclear or could be more than one, answer ${none}.`,
    user: (cards, text) => `Available cards: ${cards}\nTyped text: "${text}"`,
  },
};

const TEXT: Record<Language, GameText> = { es: ES, en: EN };

export function gameText(lang: Language | undefined): GameText {
  return TEXT[lang ?? "es"] ?? ES;
}

export function isLanguage(value: unknown): value is Language {
  return value === "es" || value === "en";
}
