import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Seitentitel mit optionaler Unterzeile und Aktionen rechts. */
export function SeitenKopf({
  titel,
  unterzeile,
  aktionen,
}: {
  titel: string;
  unterzeile?: ReactNode;
  aktionen?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.015em] text-heading">
          {titel}
        </h1>
        {unterzeile ? (
          <p className="mt-1 text-sm text-text-muted">{unterzeile}</p>
        ) : null}
      </div>
      {aktionen ? (
        <div className="flex flex-wrap items-center gap-2">{aktionen}</div>
      ) : null}
    </header>
  );
}

/** Abschnitt mit Überschrift. */
export function Abschnitt({
  titel,
  beschreibung,
  aktionen,
  children,
  className,
}: {
  titel: string;
  beschreibung?: ReactNode;
  aktionen?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mb-10", className)}>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-heading">
            {titel}
          </h2>
          {beschreibung ? (
            <p className="mt-0.5 text-xs text-text-muted">{beschreibung}</p>
          ) : null}
        </div>
        {aktionen ? (
          <div className="flex items-center gap-2">{aktionen}</div>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** Fläche mit Rahmen. */
export function Karte({
  children,
  className,
  ...rest
}: {
  children: ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[10px] border border-hairline bg-surface shadow-[0_1px_2px_0_rgb(0_0_0/0.03)]",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/** Schlüssel-Wert-Liste für Detailansichten. */
export function Kennzahlen({
  eintraege,
  spalten = 2,
}: {
  eintraege: Array<{ label: string; wert: ReactNode; hervorheben?: boolean }>;
  spalten?: 1 | 2 | 3;
}) {
  return (
    <dl
      className={cn(
        "grid gap-x-6 gap-y-3",
        spalten === 1 && "grid-cols-1",
        spalten === 2 && "grid-cols-2",
        spalten === 3 && "grid-cols-3",
      )}
    >
      {eintraege.map((e) => (
        <div key={e.label} className="min-w-0">
          <dt className="text-xs text-text-muted">{e.label}</dt>
          <dd
            className={cn(
              "mt-0.5 truncate text-sm tabular-nums text-foreground",
              e.hervorheben && "font-semibold text-heading",
            )}
          >
            {e.wert}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Segmentierte Auswahl (z. B. 13 Wochen / 24 Monate). */
export function Segmente<T extends string>({
  wert,
  optionen,
  onChange,
  label,
}: {
  wert: T;
  optionen: Array<{ wert: T; label: string }>;
  onChange: (w: T) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex h-8 items-center gap-0.5 rounded-[8px] border border-hairline bg-surface-muted p-0.5"
    >
      {optionen.map((o) => (
        <button
          key={o.wert}
          role="radio"
          aria-checked={o.wert === wert}
          onClick={() => onChange(o.wert)}
          className={cn(
            "h-full cursor-pointer px-2.5 text-xs font-medium text-text-muted transition-colors duration-150 [--board-r:6px] hover:text-foreground",
            o.wert === wert &&
              "bg-surface text-heading shadow-[0_1px_2px_0_rgb(0_0_0/0.06)]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
