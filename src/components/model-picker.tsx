"use client";

import { useDeferredValue, useMemo, useState, type ReactNode } from "react";
import {
  Brain,
  Check,
  Info,
  LoaderCircle,
  RefreshCw,
  Search,
  X,
  Zap,
} from "lucide-react";
import type { ModelInfo } from "@/lib/types";
import {
  FEATURED_MODEL_IDS,
  modelDisplayName,
} from "@/lib/models";
import { cn, formatContext } from "@/lib/utils";
import { Badge, IconButton, Modal } from "./ui";
import { useStrings, type Locale } from "@/lib/i18n";

const ES = {
  variable: "Variable",
  free: "Gratis",
  chooseModel: "Elegir modelo",
  liveCatalog: "Catálogo en vivo de OpenRouter",
  close: "Cerrar",
  searchPlaceholder: "Buscar por nombre, proveedor o id…",
  searchLabel: "Buscar modelos",
  clearSearch: "Limpiar búsqueda",
  reasoning: "Razonamiento",
  refresh: "Actualizar",
  retry: "Reintentar",
  noMatches: "No hay modelos que coincidan con esos filtros.",
  featured: "Destacados",
  allModels: "Todos los modelos",
  pricingNote:
    "Precios por millón de tokens (entrada / salida). El coste real depende del proveedor asignado.",
  fallbackNote: "Catálogo de referencia: no se pudo contactar con OpenRouter.",
  context: (value: string) => `${value} contexto`,
  image: "Imagen",
};

const STRINGS: Record<Locale, typeof ES> = {
  es: ES,
  en: {
    variable: "Variable",
    free: "Free",
    chooseModel: "Choose model",
    liveCatalog: "Live OpenRouter catalog",
    close: "Close",
    searchPlaceholder: "Search by name, provider or id…",
    searchLabel: "Search models",
    clearSearch: "Clear search",
    reasoning: "Reasoning",
    refresh: "Refresh",
    retry: "Retry",
    noMatches: "No models match those filters.",
    featured: "Featured",
    allModels: "All models",
    pricingNote:
      "Prices per million tokens (input / output). The actual cost depends on the assigned provider.",
    fallbackNote: "Reference catalog: could not reach OpenRouter.",
    context: (value: string) => `${value} context`,
    image: "Image",
  },
};

type PickerStrings = typeof ES;

function usd(value: number): string {
  if (value === 0) return "$0";
  if (value < 0.01) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
}

function priceLabel(model: ModelInfo, t: PickerStrings): string {
  const { prompt, completion } = model.pricing;
  if (prompt < 0 || completion < 0) return t.variable;
  const promptPerM = prompt * 1_000_000;
  const completionPerM = completion * 1_000_000;
  if (promptPerM === 0 && completionPerM === 0) return t.free;
  return `${usd(promptPerM)} / ${usd(completionPerM)}`;
}

function isFree(model: ModelInfo): boolean {
  return (
    model.pricing.prompt === 0 &&
    model.pricing.completion === 0
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors",
        active
          ? "border-accent/40 bg-accent-soft text-accent"
          : "border-line text-muted hover:bg-hover hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

interface ModelPickerProps {
  open: boolean;
  onClose: () => void;
  models: ModelInfo[];
  selectedId: string;
  loading: boolean;
  source: "openrouter" | "fallback" | null;
  warning: string | null;
  error: string | null;
  title?: string;
  subtitle?: string;
  onSelect: (id: string) => void;
  onRefresh: () => void;
}

export function ModelPicker({
  open,
  onClose,
  models,
  selectedId,
  loading,
  source,
  warning,
  error,
  title,
  subtitle,
  onSelect,
  onRefresh,
}: ModelPickerProps) {
  const t = useStrings(STRINGS);
  const [query, setQuery] = useState("");
  const [onlyReasoning, setOnlyReasoning] = useState(false);
  const [onlyFree, setOnlyFree] = useState(false);
  const deferredQuery = useDeferredValue(query);

  const filtered = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    return models.filter((model) => {
      if (onlyReasoning && !model.supportsReasoning) return false;
      if (onlyFree && !isFree(model)) return false;
      if (!needle) return true;
      return (
        model.name.toLowerCase().includes(needle) ||
        model.id.toLowerCase().includes(needle) ||
        model.provider.toLowerCase().includes(needle)
      );
    });
  }, [deferredQuery, models, onlyFree, onlyReasoning]);

  const { featured, others } = useMemo(() => {
    const featuredModels = filtered
      .filter((model) => FEATURED_MODEL_IDS.includes(model.id))
      .sort(
        (a, b) =>
          FEATURED_MODEL_IDS.indexOf(a.id) - FEATURED_MODEL_IDS.indexOf(b.id),
      );
    const otherModels = filtered
      .filter((model) => !FEATURED_MODEL_IDS.includes(model.id))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { featured: featuredModels, others: otherModels };
  }, [filtered]);

  const showSections = !deferredQuery.trim() && featured.length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      label={t.chooseModel}
      className="h-[86dvh] sm:h-[min(680px,86dvh)] sm:max-w-2xl"
    >
      <header className="shrink-0 border-b border-line px-4 pb-3 pt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-semibold">
              {title ?? t.chooseModel}
            </h2>
            <p className="text-[14px] text-muted">
              {subtitle ?? t.liveCatalog}
            </p>
          </div>
          <IconButton label={t.close} onClick={onClose}>
            <X size={17} />
          </IconButton>
        </div>

        <div className="relative mt-3">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
          />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.searchPlaceholder}
            aria-label={t.searchLabel}
            spellCheck={false}
            className="h-11 w-full rounded-xl border border-line bg-canvas pl-9 pr-9 text-[14px] outline-none transition-colors placeholder:text-faint focus:border-accent/60"
          />
          {query && (
            <IconButton
              label={t.clearSearch}
              size="sm"
              onClick={() => setQuery("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2"
            >
              <X size={13} />
            </IconButton>
          )}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <FilterChip
            active={onlyReasoning}
            onClick={() => setOnlyReasoning((value) => !value)}
          >
            <Brain size={12} />
            {t.reasoning}
          </FilterChip>
          <FilterChip
            active={onlyFree}
            onClick={() => setOnlyFree((value) => !value)}
          >
            <Zap size={12} />
            {t.free}
          </FilterChip>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] text-muted transition-colors hover:bg-hover hover:text-ink disabled:opacity-50"
          >
            <RefreshCw
              size={12}
              className={loading ? "animate-spin" : undefined}
            />
            {t.refresh}
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading && models.length === 0 ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 7 }).map((_, index) => (
              <div
                key={index}
                className="flex animate-pulse items-center gap-3 rounded-xl border border-line/60 p-3"
              >
                <div className="size-9 rounded-lg bg-hover" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/3 rounded bg-hover" />
                  <div className="h-2.5 w-2/3 rounded bg-hover/70" />
                </div>
              </div>
            ))}
          </div>
        ) : error && models.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <Info size={22} className="text-amber-500" />
            <p className="max-w-sm text-[14px] text-muted">{error}</p>
            <button
              type="button"
              onClick={onRefresh}
              className="rounded-lg border border-line bg-elevated px-3 py-1.5 text-[13px] font-medium hover:bg-hover"
            >
              {t.retry}
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <Search size={20} className="text-faint" />
            <p className="text-[14px] text-muted">
              {t.noMatches}
            </p>
          </div>
        ) : (
          <>
            {showSections && (
              <>
                <SectionLabel>
                  <Zap size={12} className="text-accent" />
                  {t.featured}
                </SectionLabel>
                <div className="space-y-0.5">
                  {featured.map((model) => (
                    <ModelRow
                      key={model.id}
                      model={model}
                      selected={model.id === selectedId}
                      onSelect={onSelect}
                    />
                  ))}
                </div>
                <SectionLabel className="mt-3">
                  {t.allModels}
                  <span className="ml-auto font-normal normal-case tracking-normal">
                    {others.length}
                  </span>
                </SectionLabel>
              </>
            )}
            <div className="space-y-0.5">
              {(showSections ? others : filtered).map((model) => (
                <ModelRow
                  key={model.id}
                  model={model}
                  selected={model.id === selectedId}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <footer className="shrink-0 border-t border-line px-4 py-2.5">
        <div className="flex items-start gap-2 text-[12px] leading-relaxed text-muted">
          {loading && models.length > 0 ? (
            <LoaderCircle size={13} className="mt-0.5 animate-spin" />
          ) : (
            <Info size={13} className="mt-0.5 shrink-0" />
          )}
          <p>
            {warning ?? t.pricingNote}
          </p>
        </div>
        {source === "fallback" && (
          <p className="mt-1 text-[12px] text-amber-600 dark:text-amber-300">
            {t.fallbackNote}
          </p>
        )}
      </footer>
    </Modal>
  );
}

function SectionLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-faint",
        className,
      )}
    >
      {children}
    </div>
  );
}

function ModelRow({
  model,
  selected,
  onSelect,
}: {
  model: ModelInfo;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const t = useStrings(STRINGS);
  const free = isFree(model);

  return (
    <button
      type="button"
      onClick={() => onSelect(model.id)}
      title={model.description || model.id}
      className={cn(
        "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
        selected ? "bg-accent-soft" : "hover:bg-hover",
      )}
    >
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-lg border text-[11px] font-semibold uppercase tracking-wide",
          selected
            ? "border-accent/30 bg-accent-soft text-accent"
            : "border-line bg-panel text-muted",
        )}
      >
        {model.provider.slice(0, 2)}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[14.5px] font-medium text-ink">
            {modelDisplayName(model.name)}
          </span>
          {selected && (
            <Check size={13} className="shrink-0 text-accent" />
          )}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-muted">
          <span>{model.provider}</span>
          <span className="text-faint">·</span>
          <span>{t.context(formatContext(model.contextLength))}</span>
          {model.supportsReasoning && (
            <Badge tone="violet">
              <Brain size={9} />
              {t.reasoning}
            </Badge>
          )}
          {free && (
            <Badge tone="accent">
              <Zap size={9} />
              {t.free}
            </Badge>
          )}
          {model.inputModalities.includes("image") && (
            <Badge>{t.image}</Badge>
          )}
        </span>
      </span>

      <span className="shrink-0 text-right">
        <span className="block whitespace-nowrap text-[12px] tabular-nums text-ink-soft">
          {priceLabel(model, t)}
        </span>
        <span className="block text-[11px] text-faint">USD / 1M</span>
      </span>
    </button>
  );
}
