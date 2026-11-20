"use client";

import {
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { THEMES, type Theme } from "@/lib/themes";
import { useLocale, useStrings, type Locale } from "@/lib/i18n";

const ES = { theme: "Tema" };
const STRINGS: Record<Locale, typeof ES> = { es: ES, en: { theme: "Theme" } };

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span
      style={{ width: size, height: size }}
      className="grid shrink-0 place-items-center rounded-[30%] bg-gradient-to-br from-accent to-team-blue text-white shadow-[0_4px_16px_-4px_var(--accent)]"
    >
      <Sparkles size={Math.round(size * 0.55)} strokeWidth={2.2} />
    </span>
  );
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  active?: boolean;
  size?: "sm" | "md";
};

export function IconButton({
  label,
  active,
  size = "md",
  className,
  children,
  ...props
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-lg text-muted transition-colors",
        "hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
        "disabled:pointer-events-none disabled:opacity-40",
        size === "sm" ? "h-7 w-7" : "h-9 w-9",
        active && "bg-hover text-ink",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "violet" | "amber";
  className?: string;
}) {
  const tones = {
    neutral: "border-line bg-panel text-muted",
    accent: "border-accent/25 bg-accent-soft text-accent",
    violet:
      "border-violet-500/25 bg-violet-500/10 text-violet-500 dark:text-violet-300",
    amber:
      "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-300",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

function useOverlay(open: boolean, onClose: () => void) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  return mounted;
}

export function Modal({
  open,
  onClose,
  label,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const mounted = useOverlay(open, onClose);
  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-[6px] animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={cn(
          "glass-strong relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden border shadow-2xl animate-pop",
          "rounded-t-2xl sm:max-w-lg sm:rounded-2xl",
          className,
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({
  open,
  onClose,
  label,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const mounted = useOverlay(open, onClose);
  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/45 backdrop-blur-[4px] animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={cn(
          "absolute inset-y-0 right-0 flex w-full max-w-[440px] flex-col border-l border-line bg-elevated shadow-2xl animate-slide-in",
          className,
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-10 shrink-0 rounded-full p-0.5 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
        "disabled:pointer-events-none disabled:opacity-40",
        checked ? "bg-accent" : "bg-line-strong",
      )}
    >
      <span
        className={cn(
          "block size-5 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-4" : "translate-x-0",
        )}
      />
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled,
  ariaLabel,
}: {
  value: T;
  options: Array<{ value: T; label: string; title?: string }>;
  onChange: (value: T) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "flex gap-0.5 rounded-xl border border-line bg-panel p-0.5",
        disabled && "opacity-45",
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            title={option.title}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex-1 rounded-[10px] px-2 py-1.5 text-[13px] font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
              "disabled:pointer-events-none",
              selected
                ? "bg-elevated text-ink shadow-sm ring-1 ring-line"
                : "text-muted hover:text-ink",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  disabled,
  label,
  formatValue,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  label: string;
  formatValue?: (value: number) => string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[13px]">
        <label className="font-medium text-ink-soft">{label}</label>
        <span className="tabular-nums text-muted">
          {formatValue ? formatValue(value) : value}
        </span>
      </div>
      <input
        type="range"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-line-strong accent-accent disabled:cursor-not-allowed disabled:opacity-40"
      />
    </div>
  );
}

export function ThemePicker({
  value,
  onChange,
  compact = false,
}: {
  value: Theme;
  onChange: (theme: Theme) => void;
  compact?: boolean;
}) {
  const { locale } = useLocale();
  const t = useStrings(STRINGS);
  const en = locale === "en";
  return (
    <div
      role="radiogroup"
      aria-label={t.theme}
      className={cn("grid gap-2", compact ? "grid-cols-4" : "grid-cols-2")}
    >
      {THEMES.map((theme) => {
        const selected = theme.id === value;
        const [canvas, panel, accent, red, blue] = theme.swatch;
        const label = en ? theme.labelEn : theme.label;
        const description = en ? theme.descriptionEn : theme.description;
        return (
          <button
            key={theme.id}
            type="button"
            role="radio"
            aria-checked={selected}
            title={description}
            onClick={() => onChange(theme.id)}
            className={cn(
              "group relative overflow-hidden rounded-xl border text-left transition-all duration-200",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
              selected
                ? "border-accent shadow-[0_0_0_1px_var(--accent),0_10px_30px_-12px_var(--accent)]"
                : "border-line hover:-translate-y-0.5 hover:border-line-strong",
            )}
          >
            <span
              className="relative block h-14 overflow-hidden"
              style={{
                background: `radial-gradient(circle at 20% 0%, ${accent}55, transparent 60%), ${canvas}`,
              }}
            >
              <span
                className="absolute bottom-2 left-2 right-2 top-3 grid grid-cols-5 gap-[3px] rounded-md p-[3px]"
                style={{ background: panel }}
              >
                {[red, panel, blue, accent, red, blue, red, panel, blue, accent].map(
                  (color, index) => (
                    <span
                      key={index}
                      className="rounded-[2px] transition-transform duration-300 group-hover:scale-90"
                      style={{
                        background: color,
                        opacity: color === panel ? 0.4 : 0.95,
                        transitionDelay: `${index * 18}ms`,
                      }}
                    />
                  ),
                )}
              </span>
              {selected && (
                <span className="absolute right-1.5 top-1.5 grid size-4 place-items-center rounded-full bg-accent text-accent-ink">
                  <Check size={10} strokeWidth={3} />
                </span>
              )}
            </span>
            {!compact && (
              <span className="block bg-elevated px-2.5 py-1.5">
                <span className="block text-[12.5px] font-semibold text-ink">
                  {label}
                </span>
                <span className="block truncate text-[11px] text-muted">
                  {description}
                </span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-[13px] text-muted">
      {children}
    </p>
  );
}
