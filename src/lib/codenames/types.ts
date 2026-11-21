export type Language = "es" | "en";

export type Team = "red" | "blue";

export type Seat =
  | "red_spymaster"
  | "red_operative"
  | "blue_spymaster"
  | "blue_operative";

export type SeatRole = "spymaster" | "operative";

export type CardColor = Team | "neutral" | "assassin";

export type Phase = "clue" | "guess";

export type GameStatus = "in_progress" | "paused" | "finished" | "aborted";

export type Winner = Team | "draw" | null;

export type GameOverReason =
  | "all_cards"
  | "assassin"
  | "turn_limit"
  | "aborted"
  | "cost_limit"
  | "error";

export type TurnEndReason =
  | "stopped"
  | "guesses_exhausted"
  | "opponent_card"
  | "neutral_card"
  | "assassin"
  | "clue_failed"
  | "attempts_exhausted"
  | "turn_limit";

export type GuessResult = "own" | "opponent" | "neutral" | "assassin";

export type OracleErrorCode =
  | "clue_on_board"
  | "clue_not_single_word"
  | "number_out_of_range"
  | "word_not_on_board"
  | "word_already_revealed"
  | "wrong_phase"
  | "wrong_seat"
  | "must_guess"
  | "timeout"
  | "invalid_action"
  | "no_tool_call"
  | "multiple_tool_calls"
  | "game_over";

export interface BoardCard {
  id: number;
  word: string;
  normalized: string;
  color: CardColor;
  revealed: boolean;
}

export interface Clue {
  word: string;
  number: number;
  reasoning?: string;
  say?: string;
}

export interface TurnState {
  team: Team;
  phase: Phase;
  clue: Clue | null;
  guessesLeft: number;
  guessesMade: number;
}

export interface GameState {
  id: string;
  seed: number;
  lang: Language;
  startingTeam: Team;
  board: BoardCard[];
  turn: TurnState;
  status: GameStatus;
  winner: Winner;
  winReason: GameOverReason | null;
  turnsPlayed: number;
  createdAt: number;
}

/** OpenRouter `reasoning.effort` levels, from none to max. */
export type ReasoningEffort =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

export interface SeatConfig {
  seat: Seat;
  modelId: string;
  temperature: number;
  avatarId: string;
  displayName: string;
  /** Played by the person at the keyboard instead of a model. */
  human?: boolean;
  /**
   * Reasoning effort for models that support it. Unset means the app default
   * ("low"), adapted to what the model accepts.
   */
  reasoningEffort?: ReasoningEffort;
}

export interface GameConfig {
  seed: number;
  lang: Language;
  seats: Record<Seat, SeatConfig>;
  promptVersion: string;
  speed: number;
  maxCostUsd: number | null;
}

export type GameAction =
  | {
      type: "give_clue";
      word: string;
      number: number;
      /** Private: the spymaster's own cards this clue is meant for. */
      targets?: string[];
      reasoning?: string;
      say?: string;
    }
  | { type: "guess"; word: string; reasoning?: string; say?: string }
  | { type: "stop"; reasoning?: string; say?: string };

export interface EventMeta {
  modelId?: string;
  promptVersion?: string;
  reasoning?: string;
  rawResponse?: string;
  promptTokens?: number;
  completionTokens?: number;
  costUsd?: number;
  costEstimated?: boolean;
  latencyMs?: number;
  /** Upstream provider OpenRouter routed the call to. */
  provider?: string;
  reasoningTokens?: number;
  cachedTokens?: number;
  finishReason?: string;
  /** Upstream retries (429/5xx/network) before this response. */
  retries?: number;
  /** Reasoning effort actually sent for this call. */
  reasoningEffort?: ReasoningEffort;
  /** Output token budget (max_tokens) sent for this call. */
  maxTokens?: number;
  /** The first answer ran out of tokens and was retried with less reasoning. */
  lengthRetry?: boolean;
  /**
   * How a malformed answer was rescued: JSON written as text instead of a tool
   * call, truncated arguments, or identical duplicate calls.
   */
  recovered?: "text" | "salvaged" | "deduped";
}

type EventBase = {
  meta?: EventMeta;
};

export type EngineEvent = EventBase &
  (
    | {
        type: "game_started";
        data: {
          seed: number;
          lang: Language;
          startingTeam: Team;
          board: Array<{ id: number; word: string; color: CardColor }>;
        };
      }
    | {
        type: "turn_started";
        data: { turn: number; team: Team; phase: Phase };
      }
    | {
        type: "thinking";
        seat: Seat;
        data: { state: "start" | "end" };
      }
    | {
        type: "clue_given";
        seat: Seat;
        data: {
          word: string;
          number: number;
          /** Private (redacted like reasoning): board words the clue aims at. */
          targets?: string[];
          /** Targets the model named that are not unrevealed board words. */
          targetsDropped?: number;
          reasoning?: string;
          say?: string;
          /** Hidden board words the referee masked out of `say`. */
          sayMasked?: number;
        };
      }
    | {
        type: "guess_made";
        seat: Seat;
        data: {
          word: string;
          color: CardColor;
          result: GuessResult;
          guessesLeft: number;
          guessesMade: number;
          say?: string;
          sayMasked?: number;
        };
      }
    | {
        type: "turn_ended";
        seat?: Seat;
        data: {
          reason: TurnEndReason;
          turn: number;
          nextTeam: Team | null;
          remaining: Record<Team, number>;
          reasoning?: string;
          say?: string;
          sayMasked?: number;
        };
      }
    | {
        type: "agent_error";
        seat: Seat;
        data: {
          code: OracleErrorCode;
          message: string;
          attemptsLeft: number;
          phase: Phase;
          /** Infrastructure failure (timeout, rate limit, outage), not the model's move. */
          transient?: boolean;
        };
      }
    | {
        type: "game_paused";
        data: {
          reason: "user" | "error";
          message?: string;
        };
      }
    | {
        type: "game_resumed";
        data: { control: "resume" };
      }
    | {
        type: "control_changed";
        data: { speed?: number; paused?: boolean };
      }
    | {
        type: "game_over";
        data: {
          winner: Winner;
          reason: GameOverReason;
          remaining: Record<Team, number>;
          turnsPlayed: number;
        };
      }
  );

export type StoredGameEvent = EngineEvent & { id: number; at: number };

export interface ApplyError {
  ok: false;
  code: OracleErrorCode;
  message: string;
}

export type ApplyResult =
  | { ok: true; state: GameState; events: EngineEvent[] }
  | ApplyError;

export interface AgentRequest {
  seat: Seat;
  view: AgentView;
  config: SeatConfig;
  feedback?: string;
  signal?: AbortSignal;
}

export interface AgentResponse {
  action: GameAction | null;
  error?: {
    code: OracleErrorCode;
    message: string;
    fatal?: boolean;
    aborted?: boolean;
    /** Infrastructure failure (timeout, rate limit): not useful feedback for the model. */
    transient?: boolean;
  };
  meta: EventMeta;
}

export interface AgentAdapter {
  request(request: AgentRequest): Promise<AgentResponse>;
}

export type AgentViewRole = Seat | "spectator";

export interface ViewCard {
  id: number;
  word: string;
  color: CardColor | null;
  revealed: boolean;
}

export interface AgentView {
  role: AgentViewRole;
  lang: Language;
  team: Team | null;
  board: ViewCard[];
  ownWords: string[] | null;
  opponentWords: string[] | null;
  neutralWords: string[] | null;
  assassinWord: string | null;
  /** Public card counts still hidden per team. */
  remaining: Record<Team, number>;
  revealed: Array<{ word: string; color: CardColor }>;
  turn: TurnState;
  history: string[];
}
