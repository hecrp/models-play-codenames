"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchCodenamesReplay,
  type CodenamesReplay,
} from "@/lib/codenames/client-api";
import { replayDelay, replayEvents } from "@/lib/codenames/replay";
import type { GameState, StoredGameEvent } from "@/lib/codenames/types";
import { loadLocale, type Locale } from "@/lib/i18n";

const ES = { loadFailed: "No se pudo cargar el replay." };

const STRINGS: Record<Locale, typeof ES> = {
  es: ES,
  en: { loadFailed: "Could not load the replay." },
};

export function useCodenamesReplay(gameId: string) {
  const [data, setData] = useState<CodenamesReplay | null>(null);
  const [events, setEvents] = useState<StoredGameEvent[]>([]);
  const [cursor, setCursor] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchCodenamesReplay(gameId)
      .then((response) => {
        if (cancelled) return;
        setData(response);
        setEvents(response.events);
        setCursor(Math.min(2, response.events.length));
        setError(null);
      })
      .catch((caught) => {
        if (cancelled) return;
        setError(
          caught instanceof Error ? caught.message : STRINGS[loadLocale()].loadFailed,
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  useEffect(() => {
    if (!playing || events.length === 0) return;
    if (cursor >= events.length) {
      setPlaying(false);
      return;
    }
    // The event just shown sets the pause, like the pacing of a live game.
    const delay = replayDelay(events[cursor - 1], events[cursor], speed);
    const timer = window.setTimeout(() => {
      setCursor((current) => Math.min(current + 1, events.length));
    }, delay);
    return () => window.clearTimeout(timer);
  }, [cursor, events.length, playing, speed]);

  const state: GameState | null = useMemo(() => {
    if (events.length === 0) return null;
    const slice = events.slice(0, Math.max(1, cursor));
    try {
      return replayEvents(slice);
    } catch {
      return null;
    }
  }, [cursor, events]);

  const restart = useCallback(() => {
    setCursor(Math.min(2, events.length));
    setPlaying(false);
  }, [events.length]);

  const step = useCallback(() => {
    setPlaying(false);
    setCursor((current) => Math.min(current + 1, events.length));
  }, [events.length]);

  const seek = useCallback(
    (next: number) => {
      setPlaying(false);
      setCursor(Math.max(1, Math.min(next, events.length)));
    },
    [events.length],
  );

  return {
    data,
    events,
    visibleEvents: events.slice(0, cursor),
    state,
    cursor,
    playing,
    speed,
    loading,
    error,
    finished: events.length > 0 && cursor >= events.length,
    play: () => setPlaying(true),
    pause: () => setPlaying(false),
    toggle: () => setPlaying((value) => !value),
    step,
    seek,
    restart,
    setSpeed,
  };
}
