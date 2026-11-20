export const THEME_IDS = [
  "dark",
  "light",
  "noir",
  "neon",
  "terminal",
  "aurora",
  "dossier",
  "sakura",
] as const;

export type Theme = (typeof THEME_IDS)[number];

export interface ThemeDefinition {
  id: Theme;
  label: string;
  description: string;
  labelEn: string;
  descriptionEn: string;
  dark: boolean;
  /** Swatches used by the theme picker preview: canvas, panel, accent, red, blue. */
  swatch: [string, string, string, string, string];
}

export const THEMES: ThemeDefinition[] = [
  {
    id: "dark",
    label: "Grafito",
    description: "Oscuro sobrio, el clásico",
    labelEn: "Graphite",
    descriptionEn: "Sober dark, the classic",
    dark: true,
    swatch: ["#0d0e10", "#1a1d21", "#17c49a", "#ef4444", "#3b82f6"],
  },
  {
    id: "light",
    label: "Claro",
    description: "Limpio y luminoso",
    labelEn: "Light",
    descriptionEn: "Clean and bright",
    dark: false,
    swatch: ["#ffffff", "#f2f2f5", "#0f9d78", "#dc2626", "#2563eb"],
  },
  {
    id: "noir",
    label: "Noir",
    description: "Agencia secreta, oro y humo",
    labelEn: "Noir",
    descriptionEn: "Secret agency, gold and smoke",
    dark: true,
    swatch: ["#0b0b0f", "#17161c", "#e5b65c", "#d94a3d", "#4f7fd9"],
  },
  {
    id: "neon",
    label: "Neón",
    description: "Synthwave a medianoche",
    labelEn: "Neon",
    descriptionEn: "Midnight synthwave",
    dark: true,
    swatch: ["#0a0614", "#160e2a", "#ff3ec8", "#ff2d6f", "#22d3ee"],
  },
  {
    id: "terminal",
    label: "Terminal",
    description: "Fósforo verde, modo hacker",
    labelEn: "Terminal",
    descriptionEn: "Green phosphor, hacker mode",
    dark: true,
    swatch: ["#030805", "#0a140d", "#39ff88", "#ff5f56", "#4cc9f0"],
  },
  {
    id: "aurora",
    label: "Aurora",
    description: "Cielo polar en movimiento",
    labelEn: "Aurora",
    descriptionEn: "Moving polar sky",
    dark: true,
    swatch: ["#060b1a", "#0f1730", "#8b7bff", "#fb7185", "#38bdf8"],
  },
  {
    id: "dossier",
    label: "Dossier",
    description: "Papel antiguo y sello confidencial",
    labelEn: "Dossier",
    descriptionEn: "Old paper and a confidential stamp",
    dark: false,
    swatch: ["#efe6d2", "#e5d9bf", "#9b2c2c", "#b3261e", "#1f4e8c"],
  },
  {
    id: "sakura",
    label: "Sakura",
    description: "Pastel suave en flor",
    labelEn: "Sakura",
    descriptionEn: "Soft pastel in bloom",
    dark: false,
    swatch: ["#fff7fa", "#fdeaf1", "#db2777", "#e11d48", "#6366f1"],
  },
];

export const DEFAULT_THEME: Theme = "dark";

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEME_IDS as readonly string[]).includes(value);
}

export function themeById(id: Theme): ThemeDefinition {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0];
}

export function isDarkTheme(id: Theme): boolean {
  return themeById(id).dark;
}

export function applyThemeToDocument(id: Theme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = id;
  root.classList.toggle("dark", isDarkTheme(id));
}

const DARK_IDS = THEMES.filter((theme) => theme.dark).map((theme) => theme.id);

/** Inline script that applies the stored theme before hydration (no flash). */
export const THEME_BOOT_SCRIPT = `(function(){var d=${JSON.stringify(DARK_IDS)};var ids=${JSON.stringify(THEME_IDS)};var t="dark";try{var s=localStorage.getItem("openchat:theme:v1");if(s&&ids.indexOf(s)>-1)t=s;}catch(e){}var r=document.documentElement;r.dataset.theme=t;r.classList.toggle("dark",d.indexOf(t)>-1);})();`;
