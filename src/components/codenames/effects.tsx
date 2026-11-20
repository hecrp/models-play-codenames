"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Palette } from "lucide-react";
import { THEMES, themeById, type Theme } from "@/lib/themes";
import { useLocale, useStrings, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const ES = {
  changeTheme: "Cambiar tema",
  themeTitle: (label: string) => `Tema: ${label}`,
  themes: "Temas",
};

const STRINGS: Record<Locale, typeof ES> = {
  es: ES,
  en: {
    changeTheme: "Change theme",
    themeTitle: (label) => `Theme: ${label}`,
    themes: "Themes",
  },
};

function seeded(index: number, salt: number): number {
  const x = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function Backdrop() {
  const petals = useMemo(
    () =>
      Array.from({ length: 16 }, (_, index) => ({
        left: `${Math.round(seeded(index, 1) * 100)}%`,
        duration: `${(9 + seeded(index, 2) * 10).toFixed(1)}s`,
        delay: `${(-seeded(index, 3) * 18).toFixed(1)}s`,
        drift: `${Math.round(seeded(index, 4) * 160 - 40)}px`,
        scale: (0.6 + seeded(index, 5) * 0.8).toFixed(2),
      })),
    [],
  );

  return (
    <div className="cn-backdrop" aria-hidden="true">
      <div className="cn-orb cn-orb-a" />
      <div className="cn-orb cn-orb-b" />
      <div className="cn-orb cn-orb-c" />
      <div className="cn-aurora">
        <span />
        <span />
      </div>
      <div className="cn-sun" />
      <div className="cn-grid" />
      <div className="cn-petals">
        {petals.map((petal, index) => (
          <span
            key={index}
            style={
              {
                left: petal.left,
                animationDuration: petal.duration,
                animationDelay: petal.delay,
                "--drift": petal.drift,
                scale: petal.scale,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
      <div className="cn-noise" />
      <div className="cn-scanlines" />
      <div className="cn-vignette" />
    </div>
  );
}

export function Confetti({
  colors,
  count = 90,
}: {
  colors: string[];
  count?: number;
}) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, index) => ({
        left: `${Math.round(seeded(index, 7) * 100)}%`,
        color: colors[index % colors.length],
        duration: `${(3.4 + seeded(index, 8) * 3.2).toFixed(1)}s`,
        delay: `${(seeded(index, 9) * 0.9).toFixed(1)}s`,
        drift: `${Math.round(seeded(index, 10) * 240 - 120)}px`,
        spin: `${Math.round(seeded(index, 11) * 1080 - 540)}deg`,
        width: 6 + Math.round(seeded(index, 12) * 6),
        round: seeded(index, 13) > 0.7,
      })),
    [colors, count],
  );

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="cn-confetti" aria-hidden="true">
      {pieces.map((piece, index) => (
        <span
          key={index}
          style={
            {
              left: piece.left,
              width: piece.width,
              height: piece.round ? piece.width : piece.width * 1.6,
              borderRadius: piece.round ? 9999 : 2,
              "--c": piece.color,
              "--d": piece.duration,
              "--delay": piece.delay,
              "--drift": piece.drift,
              "--spin": piece.spin,
            } as React.CSSProperties
          }
        />
      ))}
    </div>,
    document.body,
  );
}

export function ThemeMenu({
  theme,
  onChange,
}: {
  theme: Theme;
  onChange: (theme: Theme) => void;
}) {
  const t = useStrings(STRINGS);
  const { locale } = useLocale();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = themeById(theme);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t.changeTheme}
        title={t.themeTitle(locale === "en" ? current.labelEn : current.label)}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-muted transition-colors hover:bg-hover hover:text-ink",
          open && "bg-hover text-ink",
        )}
      >
        <Palette size={16} />
        <span className="flex -space-x-1">
          {current.swatch.slice(2).map((color) => (
            <span
              key={color}
              className="size-2.5 rounded-full ring-2 ring-canvas"
              style={{ background: color }}
            />
          ))}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="glass-strong animate-pop absolute right-0 top-11 z-40 w-64 rounded-2xl border p-1.5"
        >
          <p className="px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">
            {t.themes}
          </p>
          {THEMES.map((item) => {
            const selected = item.id === theme;
            const [canvas, , accent, red, blue] = item.swatch;
            return (
              <button
                key={item.id}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => {
                  onChange(item.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors",
                  selected ? "bg-accent-soft" : "hover:bg-hover",
                )}
              >
                <span
                  className="relative grid size-8 shrink-0 grid-cols-2 gap-[2px] overflow-hidden rounded-lg border border-line p-[3px]"
                  style={{ background: canvas }}
                >
                  <span className="rounded-[3px]" style={{ background: red }} />
                  <span className="rounded-[3px]" style={{ background: blue }} />
                  <span
                    className="col-span-2 rounded-[3px]"
                    style={{ background: accent }}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-ink">
                    {locale === "en" ? item.labelEn : item.label}
                  </span>
                  <span className="block truncate text-[11px] text-muted">
                    {locale === "en" ? item.descriptionEn : item.description}
                  </span>
                </span>
                {selected && <Check size={14} className="shrink-0 text-accent" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
