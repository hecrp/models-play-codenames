import type { Language } from "./types";

/** Messages returned by the HTTP API. They follow the UI language (x-locale header). */
const ES = {
  badBody: "No se pudo leer el cuerpo de la petición.",
  invalidBody: "El cuerpo de la petición no es válido.",
  missingApiKey: "Falta una API key para algún modelo: la de OpenRouter o la de su proveedor (OpenAI, Anthropic, Gemini). Añádela en Ajustes.",
  tooManyGames: (max: number) => `Ya tienes ${max} partidas activas. Aborta o espera a que terminen.`,
  modelWithoutTools: (model: string, seat: string) =>
    `El modelo ${model} no admite tool calling. Elige otro para el asiento ${seat}.`,
  unknownModel: (model: string) => `El modelo ${model} no está en el catálogo actual de OpenRouter.`,
  createFailed: "No se pudo crear la partida. Revisa la configuración y vuelve a intentarlo.",
  notFound: "Partida no encontrada.",
  controlFailed: "No se pudo aplicar el control.",
  invalidAction: "Acción no válida.",
  missingSeat: (seat: string) => `Falta la configuración del asiento ${seat}.`,
  invalidModel: (seat: string) => `El modelo del asiento ${seat} no es válido.`,
  invalidTemperature: (seat: string) => `La temperatura del asiento ${seat} debe estar entre 0 y 2.`,
  invalidSeed: "La semilla debe ser un entero entre 0 y 2147483647.",
  invalidLanguage: "Idioma no soportado.",
  missingSeats: "Faltan los cuatro asientos de la partida.",
  oneHuman: "Solo puede jugar una persona por partida.",
  missingControl: "Falta la acción de control.",
  unknownControl: (action: string) => `Acción de control desconocida: ${action}.`,
  invalidSpeed: "La velocidad debe ser 0.25, 0.5, 1 o 2.",
  codes: {
    not_running: "La partida no está en ejecución. Reanúdala con tu API key.",
    game_over: "La partida ya terminó.",
    no_human: "En esta partida no juega ninguna persona.",
    forbidden: "Este asiento pertenece a otro navegador.",
  } as Record<string, string>,
};

type ApiText = typeof ES;

const EN: ApiText = {
  badBody: "Could not read the request body.",
  invalidBody: "The request body is not valid.",
  missingApiKey: "A model has no API key to use: add OpenRouter's or its provider's own (OpenAI, Anthropic, Gemini) in Settings.",
  tooManyGames: (max) => `You already have ${max} active games. Abort one or wait for them to finish.`,
  modelWithoutTools: (model, seat) =>
    `The model ${model} does not support tool calling. Pick another one for seat ${seat}.`,
  unknownModel: (model) => `The model ${model} is not in the current OpenRouter catalog.`,
  createFailed: "Could not create the game. Check the setup and try again.",
  notFound: "Game not found.",
  controlFailed: "Could not apply the control.",
  invalidAction: "Invalid action.",
  missingSeat: (seat) => `Missing configuration for seat ${seat}.`,
  invalidModel: (seat) => `The model for seat ${seat} is not valid.`,
  invalidTemperature: (seat) => `The temperature for seat ${seat} must be between 0 and 2.`,
  invalidSeed: "The seed must be an integer between 0 and 2147483647.",
  invalidLanguage: "Unsupported language.",
  missingSeats: "The four seats of the game are missing.",
  oneHuman: "Only one person can play per game.",
  missingControl: "Missing control action.",
  unknownControl: (action) => `Unknown control action: ${action}.`,
  invalidSpeed: "Speed must be 0.25, 0.5, 1 or 2.",
  codes: {
    not_running: "The game is not running. Resume it with your API key.",
    game_over: "The game is already over.",
    no_human: "No person plays in this game.",
    forbidden: "This seat belongs to another browser.",
  },
};

export function apiText(locale: Language): ApiText {
  return locale === "en" ? EN : ES;
}

export function localeFromHeaders(headers: Headers): Language {
  return headers.get("x-locale") === "en" ? "en" : "es";
}
