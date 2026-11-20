"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CodenamesApiError,
  controlCodenamesGame,
  eventsUrl,
  fetchCodenamesGame,
  fetchCodenamesReplay,
  type CodenamesGameDetail,
  type CodenamesRuntimeStatus,
} from "@/lib/codenames/client-api";
import { applySpectatorEvent } from "@/lib/codenames/spectator-reducer";
import type { GameState, Seat, StoredGameEvent } from "@/lib/codenames/types";
import { loadLocale, type Locale } from "@/lib/i18n";

const ES = {
  unknownError: "Error desconocido.",
  notRunning:
    "La partida no está en ejecución. Pulsa Reanudar para retomarla con tu clave.",
};

const STRINGS: Record<Locale, typeof ES> = {
  es: ES,
  en: {
    unknownError: "Unknown error.",
    notRunning: "The game is not running. Press Resume to continue it with your key.",
  },
};

export type CodenamesConnection =
  | "connecting"
  | "live"
  | "reconnecting"
  | "closed"
  | "error";

function isOver(status: string | null | undefined): boolean {
  return status === "finished" || status === "aborted";
}

function errorMessage(error: unknown): string {
  if (error instanceof CodenamesApiError) return error.message;
  if (error instanceof Error) return error.message;
  return STRINGS[loadLocale()].unknownError;
}

export function useCodenamesGame(gameId: string, apiKey: string) {
  const [detail, setDetail] = useState<CodenamesGameDetail | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [events, setEvents] = useState<StoredGameEvent[]>([]);
  const [runtime, setRuntime] = useState<CodenamesRuntimeStatus | null>(null);
  const [connection, setConnection] =
    useState<CodenamesConnection>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [thinking, setThinking] = useState<Seat | null>(null);
  const [recentGuess, setRecentGuess] = useState<string | null>(null);

  const sourceRef = useRef<EventSource | null>(null);
  const seqRef = useRef(0);
  const overRef = useRef(false);
  const mountedRef = useRef(true);
  const reconnectTimerRef = useRef<number | null>(null);
  const guessTimerRef = useRef<number | null>(null);
  const resyncRef = useRef<() => void>(() => {});

  const closeSource = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    sourceRef.current?.close();
    sourceRef.current = null;
  }, []);

  const handleEvent = useCallback(
    (event: StoredGameEvent) => {
      if (!mountedRef.current) return;
      if (event.id <= seqRef.current) return;
      seqRef.current = event.id;

      setEvents((previous) => {
        if (previous.some((candidate) => candidate.id === event.id)) {
          return previous;
        }
        return [...previous, event].sort((a, b) => a.id - b.id);
      });
      setState((previous) =>
        previous ? applySpectatorEvent(previous, event) : previous,
      );

      if (event.type === "thinking") {
        setThinking((current) =>
          event.data.state === "start"
            ? event.seat
            : current === event.seat
              ? null
              : current,
        );
      }

      if (event.type === "guess_made") {
        setRecentGuess(event.data.word);
        if (guessTimerRef.current !== null) {
          window.clearTimeout(guessTimerRef.current);
        }
        guessTimerRef.current = window.setTimeout(() => {
          guessTimerRef.current = null;
          setRecentGuess(null);
        }, 700);
      }

      if (event.type === "game_over") {
        overRef.current = true;
        setThinking(null);
        closeSource();
        setConnection("closed");
        // Human-operative games hide colors until the end; fetch the full log now.
        window.setTimeout(() => resyncRef.current(), 300);
      }
    },
    [closeSource],
  );

  const connect = useCallback(
    (after: number) => {
      closeSource();
      if (overRef.current || !mountedRef.current) {
        setConnection("closed");
        return;
      }

      setConnection("connecting");
      const source = new EventSource(eventsUrl(gameId, after));
      sourceRef.current = source;

      source.onopen = () => {
        if (mountedRef.current && sourceRef.current === source) {
          setConnection("live");
        }
      };

      source.onmessage = (message) => {
        try {
          handleEvent(JSON.parse(message.data) as StoredGameEvent);
        } catch {
          // Ignore a malformed event.
        }
      };

      source.onerror = () => {
        source.close();
        if (sourceRef.current === source) sourceRef.current = null;
        if (overRef.current || !mountedRef.current) return;
        setConnection("reconnecting");
        if (reconnectTimerRef.current !== null) return;
        reconnectTimerRef.current = window.setTimeout(() => {
          reconnectTimerRef.current = null;
          resyncRef.current();
        }, 1_500);
      };
    },
    [closeSource, gameId, handleEvent],
  );

  const resync = useCallback(async () => {
    try {
      const [nextDetail, replay] = await Promise.all([
        fetchCodenamesGame(gameId),
        fetchCodenamesReplay(gameId),
      ]);
      if (!mountedRef.current) return;

      setDetail(nextDetail);
      setRuntime(nextDetail.runtime);
      setError(null);

      let nextState = nextDetail.game.state;
      const maxSnapshotSeq = nextDetail.game.seq;
      for (const event of replay.events) {
        if (event.id > maxSnapshotSeq) {
          nextState = applySpectatorEvent(nextState, event);
        }
      }
      const maxSeq = Math.max(
        nextDetail.game.seq,
        ...replay.events.map((event) => event.id),
        0,
      );

      setState(nextState);
      setEvents(replay.events);
      seqRef.current = maxSeq;
      overRef.current = isOver(nextDetail.game.status);
      let pendingSeat: Seat | null = null;
      for (const event of replay.events) {
        if (event.type === "thinking") {
          pendingSeat = event.data.state === "start" ? event.seat : null;
        }
      }
      setThinking(overRef.current ? null : pendingSeat);

      if (overRef.current) {
        closeSource();
        setConnection("closed");
        return;
      }

      if (!nextDetail.hasRuntime) {
        closeSource();
        setConnection("closed");
        setError(STRINGS[loadLocale()].notRunning);
        return;
      }

      connect(maxSeq);
    } catch (caught) {
      if (!mountedRef.current) return;
      setError(errorMessage(caught));
      setConnection("error");
    }
  }, [closeSource, connect, gameId]);

  useEffect(() => {
    resyncRef.current = () => {
      void resync();
    };
  }, [resync]);

  useEffect(() => {
    mountedRef.current = true;
    overRef.current = false;
    seqRef.current = 0;
    void resync();

    return () => {
      mountedRef.current = false;
      closeSource();
      if (guessTimerRef.current !== null) {
        window.clearTimeout(guessTimerRef.current);
        guessTimerRef.current = null;
      }
    };
  }, [closeSource, resync]);

  const control = useCallback(
    async (
      action: "pause" | "resume" | "step" | "step_turn" | "abort" | "speed",
      speed?: number,
    ) => {
      setError(null);
      try {
        const result = await controlCodenamesGame(gameId, action, {
          speed,
          apiKey,
        });
        if (result.status) setRuntime(result.status);
        if (action === "resume") {
          await resync();
        }
        return result;
      } catch (caught) {
        setError(errorMessage(caught));
        return null;
      }
    },
    [apiKey, gameId, resync],
  );

  return {
    detail,
    state,
    events,
    runtime,
    connection,
    error,
    thinking,
    recentGuess,
    pause: () => control("pause"),
    resume: () => control("resume"),
    step: () => control("step"),
    stepTurn: () => control("step_turn"),
    abort: () => control("abort"),
    setSpeed: (speed: number) => control("speed", speed),
    refresh: resync,
    clearError: () => setError(null),
  };
}
