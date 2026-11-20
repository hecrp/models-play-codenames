"use client";

import { Languages } from "lucide-react";
import { LOCALES, useLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Compact ES/EN toggle for headers. */
export function LocaleSwitch({ className }: { className?: string }) {
  const { locale, setLocale } = useLocale();
  return (
    <div
      role="group"
      aria-label="Language / Idioma"
      className={cn(
        "inline-flex h-9 items-center gap-0.5 rounded-lg border border-line bg-panel p-0.5",
        className,
      )}
    >
      <Languages size={13} className="mx-1 text-muted" aria-hidden="true" />
      {LOCALES.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => setLocale(option.id)}
          aria-pressed={locale === option.id}
          title={option.label}
          className={cn(
            "h-7 rounded-md px-2 text-[11.5px] font-semibold uppercase transition-colors",
            locale === option.id
              ? "bg-accent text-accent-ink"
              : "text-muted hover:bg-hover hover:text-ink",
          )}
        >
          {option.id}
        </button>
      ))}
    </div>
  );
}
