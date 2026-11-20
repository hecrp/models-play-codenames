"use client";

import { cn } from "@/lib/utils";
import type { AvatarDefinition } from "@/lib/codenames/avatars";

const PALETTES: Record<
  string,
  { bg: string; face: string; accent: string; detail: string }
> = {
  zorro: { bg: "#f59e0b", face: "#fff7ed", accent: "#7c2d12", detail: "#ea580c" },
  buho: { bg: "#a16207", face: "#fef3c7", accent: "#451a03", detail: "#d97706" },
  pulpo: { bg: "#8b5cf6", face: "#ede9fe", accent: "#4c1d95", detail: "#a78bfa" },
  gato: { bg: "#fcd34d", face: "#fffbeb", accent: "#78350f", detail: "#fbbf24" },
  rana: { bg: "#22c55e", face: "#dcfce7", accent: "#14532d", detail: "#4ade80" },
  pinguino: { bg: "#0ea5e9", face: "#f0f9ff", accent: "#082f49", detail: "#38bdf8" },
  koala: { bg: "#94a3b8", face: "#f8fafc", accent: "#1e293b", detail: "#cbd5e1" },
  dragon: { bg: "#14b8a6", face: "#ccfbf1", accent: "#134e4a", detail: "#2dd4bf" },
  lobo: { bg: "#64748b", face: "#f1f5f9", accent: "#0f172a", detail: "#94a3b8" },
  tortuga: { bg: "#65a30d", face: "#ecfccb", accent: "#1a2e05", detail: "#84cc16" },
  abeja: { bg: "#facc15", face: "#fefce8", accent: "#422006", detail: "#0f172a" },
  cangrejo: { bg: "#ef4444", face: "#fef2f2", accent: "#7f1d1d", detail: "#f87171" },
};

export function AvatarArt({
  id,
  size = 52,
  label,
}: {
  id: string;
  size?: number;
  label?: string;
}) {
  const palette = PALETTES[id] ?? PALETTES.zorro;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={label ?? id}
      className="block"
    >
      <circle cx="32" cy="32" r="31" fill={palette.bg} />
      <circle cx="32" cy="32" r="27" fill={palette.detail} opacity="0.35" />

      {id === "zorro" && (
        <>
          <path d="M12 20 18 6l10 10Z" fill={palette.bg} stroke={palette.accent} strokeWidth="1.5" />
          <path d="M52 20 46 6 36 16Z" fill={palette.bg} stroke={palette.accent} strokeWidth="1.5" />
          <path d="M15 18 19 10l6 6Z" fill={palette.face} opacity="0.75" />
          <path d="M49 18 45 10l-6 6Z" fill={palette.face} opacity="0.75" />
          <path d="M17 36c5 12 25 12 30 0-4 5-26 5-30 0Z" fill={palette.face} />
        </>
      )}

      {id === "buho" && (
        <>
          <path d="M14 22 18 8l10 10Z" fill={palette.bg} stroke={palette.accent} strokeWidth="1.5" />
          <path d="M50 22 46 8 36 18Z" fill={palette.bg} stroke={palette.accent} strokeWidth="1.5" />
          <circle cx="24" cy="31" r="8" fill={palette.face} />
          <circle cx="40" cy="31" r="8" fill={palette.face} />
          <path d="m32 34 5 9-10 0Z" fill="#f97316" />
        </>
      )}

      {id === "pulpo" && (
        <>
          <path
            d="M14 42c4 8 8 8 12 2 3 7 9 7 12 0 4 6 8 6 12-2"
            fill="none"
            stroke={palette.face}
            strokeWidth="5"
            strokeLinecap="round"
          />
          <circle cx="24" cy="28" r="3" fill={palette.accent} />
          <circle cx="40" cy="28" r="3" fill={palette.accent} />
        </>
      )}

      {id === "gato" && (
        <>
          <path d="M14 22 18 7l11 10Z" fill={palette.bg} stroke={palette.accent} strokeWidth="1.5" />
          <path d="M50 22 46 7 35 17Z" fill={palette.bg} stroke={palette.accent} strokeWidth="1.5" />
          <path d="M18 20 20 12l7 5Z" fill={palette.face} opacity="0.8" />
          <path d="M46 20 44 12l-7 5Z" fill={palette.face} opacity="0.8" />
          <path
            d="M12 34h10M12 40h10M42 34h10M42 40h10"
            stroke={palette.accent}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </>
      )}

      {id === "rana" && (
        <>
          <circle cx="21" cy="24" r="9" fill={palette.bg} />
          <circle cx="43" cy="24" r="9" fill={palette.bg} />
          <circle cx="21" cy="24" r="6" fill={palette.face} />
          <circle cx="43" cy="24" r="6" fill={palette.face} />
          <path
            d="M17 39c8 8 22 8 30 0"
            fill="none"
            stroke={palette.accent}
            strokeWidth="3"
            strokeLinecap="round"
          />
        </>
      )}

      {id === "pinguino" && (
        <>
          <ellipse cx="32" cy="38" rx="17" ry="19" fill={palette.face} />
          <path d="m28 33 8 5-8 5Z" fill="#f97316" />
          <path d="M16 42c-6 1-8 5-7 9 4-1 8-4 10-7Z" fill={palette.bg} />
          <path d="M48 42c6 1 8 5 7 9-4-1-8-4-10-7Z" fill={palette.bg} />
        </>
      )}

      {id === "koala" && (
        <>
          <circle cx="14" cy="24" r="10" fill={palette.bg} />
          <circle cx="50" cy="24" r="10" fill={palette.bg} />
          <circle cx="14" cy="24" r="6" fill={palette.detail} />
          <circle cx="50" cy="24" r="6" fill={palette.detail} />
          <ellipse cx="32" cy="38" rx="6" ry="5" fill={palette.accent} />
        </>
      )}

      {id === "dragon" && (
        <>
          <path d="M18 18 13 5l11 7Z" fill={palette.face} />
          <path d="M46 18 51 5 40 12Z" fill={palette.face} />
          <path d="M16 48c5 7 27 7 32 0" fill="none" stroke={palette.accent} strokeWidth="3" />
          <circle cx="24" cy="28" r="2.5" fill={palette.accent} />
          <circle cx="40" cy="28" r="2.5" fill={palette.accent} />
          <circle cx="22" cy="44" r="2" fill={palette.accent} opacity="0.6" />
          <circle cx="42" cy="44" r="2" fill={palette.accent} opacity="0.6" />
        </>
      )}

      {id === "lobo" && (
        <>
          <path d="M14 22 17 6l11 10Z" fill={palette.bg} stroke={palette.accent} strokeWidth="1.5" />
          <path d="M50 22 47 6 36 16Z" fill={palette.bg} stroke={palette.accent} strokeWidth="1.5" />
          <path d="M20 38c4 8 20 8 24 0-3 3-21 3-24 0Z" fill={palette.face} />
          <circle cx="24" cy="28" r="2.5" fill={palette.accent} />
          <circle cx="40" cy="28" r="2.5" fill={palette.accent} />
          <circle cx="32" cy="34" r="3" fill={palette.accent} />
        </>
      )}

      {id === "tortuga" && (
        <>
          <path d="M12 44c0-15 9-24 20-24s20 9 20 24Z" fill={palette.bg} />
          <path d="M20 40c1-8 5-13 12-13s11 5 12 13Z" fill={palette.detail} opacity="0.7" />
          <path d="M32 27v16M22 40h20" stroke={palette.accent} strokeWidth="2" opacity="0.5" />
        </>
      )}

      {id === "abeja" && (
        <>
          <path d="M22 18 18 8M42 18l4-10" stroke={palette.accent} strokeWidth="2" strokeLinecap="round" />
          <circle cx="18" cy="8" r="2" fill={palette.accent} />
          <circle cx="46" cy="8" r="2" fill={palette.accent} />
          <path d="M16 26h32M16 38h32" stroke={palette.accent} strokeWidth="5" opacity="0.75" />
          <ellipse cx="17" cy="28" rx="7" ry="12" fill={palette.face} opacity="0.65" transform="rotate(-20 17 28)" />
          <ellipse cx="47" cy="28" rx="7" ry="12" fill={palette.face} opacity="0.65" transform="rotate(20 47 28)" />
        </>
      )}

      {id === "cangrejo" && (
        <>
          <path d="M18 22 8 16M46 22l10-6" stroke={palette.bg} strokeWidth="5" strokeLinecap="round" />
          <path d="M8 16 4 22l8 2Z" fill={palette.bg} />
          <path d="M56 16 60 22l-8 2Z" fill={palette.bg} />
          <path d="M22 18v-6M42 18v-6" stroke={palette.accent} strokeWidth="2" />
          <circle cx="22" cy="11" r="3" fill={palette.accent} />
          <circle cx="42" cy="11" r="3" fill={palette.accent} />
        </>
      )}

      {id !== "buho" && id !== "pulpo" && id !== "tortuga" && id !== "abeja" && id !== "cangrejo" && (
        <>
          <circle cx="24" cy="30" r="2.6" fill={palette.accent} />
          <circle cx="40" cy="30" r="2.6" fill={palette.accent} />
          <path
            d="M27 39c3 2 7 2 10 0"
            fill="none"
            stroke={palette.accent}
            strokeWidth="2"
            strokeLinecap="round"
          />
        </>
      )}

      {(id === "buho" || id === "pulpo") && (
        <>
          <circle cx="24" cy="31" r="2.2" fill={palette.accent} />
          <circle cx="40" cy="31" r="2.2" fill={palette.accent} />
        </>
      )}

      {id === "tortuga" && (
        <>
          <circle cx="20" cy="30" r="2.2" fill={palette.accent} />
          <circle cx="44" cy="30" r="2.2" fill={palette.accent} />
        </>
      )}

      {id === "abeja" && (
        <>
          <circle cx="24" cy="30" r="2.2" fill={palette.accent} />
          <circle cx="40" cy="30" r="2.2" fill={palette.accent} />
          <path d="M28 40c2 2 6 2 8 0" fill="none" stroke={palette.accent} strokeWidth="2" strokeLinecap="round" />
        </>
      )}

      {id === "cangrejo" && (
        <>
          <circle cx="24" cy="30" r="2.2" fill={palette.accent} />
          <circle cx="40" cy="30" r="2.2" fill={palette.accent} />
          <path d="M26 40c4 3 8 3 12 0" fill="none" stroke={palette.accent} strokeWidth="2" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

export function Avatar({
  avatar,
  team,
  size = 48,
  active = true,
  className,
}: {
  avatar: AvatarDefinition;
  team: "red" | "blue" | null;
  size?: number;
  active?: boolean;
  className?: string;
}) {
  const ring =
    team === "red"
      ? "border-team-red/80 shadow-[0_0_18px_-2px_var(--team-red)]"
      : team === "blue"
        ? "border-team-blue/80 shadow-[0_0_18px_-2px_var(--team-blue)]"
        : "border-line-strong shadow-none";

  return (
    <span
      className={cn(
        "inline-grid shrink-0 place-items-center overflow-hidden rounded-full border-2 bg-canvas transition-all duration-300",
        ring,
        active ? "opacity-100" : "opacity-45 grayscale",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <AvatarArt id={avatar.id} size={size - 4} label={avatar.name} />
    </span>
  );
}
