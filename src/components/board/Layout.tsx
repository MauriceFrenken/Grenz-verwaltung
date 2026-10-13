import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { STEUERUNG } from "@/modules/shell/navigation";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { Buehne } from "./Bausteine";

/**
 * Seitenkopf: Bereich und Managementfrage der Seite, Titel, Unterzeile,
 * Aktionen rechts und optional Kennzahlen darunter.
 */
export function SeitenKopf({
  titel,
  unterzeile,
  aktionen,
  etikett,
  children,
}: {
  titel: string;
  unterzeile?: ReactNode;
  aktionen?: ReactNode;
  /** Standard: Bereich und Frage aus der Navigation */
  etikett?: ReactNode;
  /** Kennzahlen im Kopf */
  children?: ReactNode;
}) {
  const pfad = useRouterState({ select: (s) => s.location.pathname });
  const bereich = STEUERUNG.find((b) => b.eintraege.some((e) => e.to === pfad));
  const eintrag = bereich?.eintraege.find((e) => e.to === pfad);
  const marke =
    etikett ??
    (bereich && eintrag ? (
      <>
        <span className="font-medium text-heading">{bereich.label}</span>
        <span className="mx-1.5 text-text-subtle">/</span>
        {eintrag.frage}
      </>
    ) : null);
  return (
    <Buehne>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {marke ? (
            <div className="mb-2 text-xs text-text-muted">{marke}</div>
          ) : null}
          <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.025em] text-heading">
            {titel}
          </h1>
          {unterzeile ? (
            <p className="mt-1.5 max-w-3xl text-sm text-text-muted">
              {unterzeile}
            </p>
          ) : null}
        </div>
        {aktionen ? (
          <div className="nicht-drucken flex flex-wrap items-center gap-2">
            {aktionen}
          </div>
        ) : null}
      </div>
      {children ? <div className="mt-6">{children}</div> : null}
    </Buehne>
  );
}

/** Kennzahl im Seitenkopf als Karte: Bezeichnung, große Zahl, Zusatz, optional Symbol. */
export function BuehnenKennzahl({
  label,
  wert,
  hinweis,
  ampel,
  href,
  title,
  quelle,
  icon: Icon,
  className,
}: {
  label: string;
  wert: ReactNode;
  hinweis?: ReactNode;
  ampel?: "gruen" | "gelb" | "rot" | "grau";
  href?: string;
  title?: string;
  /** Herkunft der Zahl (Tooltip), wie bei KpiKarte */
  quelle?: string;
  icon?: LucideIcon;
  className?: string;
}) {
  title = title ?? quelle;
  const ton =
    ampel === "rot"
      ? "bg-bad-soft text-bad"
      : ampel === "gelb"
        ? "bg-warn-soft text-warn"
        : ampel === "gruen"
          ? "bg-ok-soft text-ok"
          : "bg-brand-soft text-brand-text";
  const punkt =
    ampel === "rot"
      ? "bg-bad"
      : ampel === "gelb"
        ? "bg-warn"
        : ampel === "gruen"
          ? "bg-ok"
          : "bg-text-subtle";
  const inhalt = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">
          {ampel && !Icon ? (
            <span
              className={cn("size-1.5 shrink-0 rounded-full", punkt)}
              aria-hidden
            />
          ) : null}
          <span className="truncate">{label}</span>
        </div>
        {Icon ? (
          <span
            className={cn(
              "-mr-1 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg",
              ton,
            )}
            aria-hidden
          >
            <Icon className="size-4" />
          </span>
        ) : href ? (
          <ArrowUpRight
            className="size-3.5 shrink-0 text-text-subtle transition-colors group-hover:text-heading"
            aria-hidden
          />
        ) : null}
      </div>
      <div className="mt-2.5 text-[28px] font-semibold leading-none tracking-[-0.025em] text-heading">
        {wert}
      </div>
      {hinweis ? (
        <div className="ziffern mt-2.5 text-xs text-text-muted">{hinweis}</div>
      ) : null}
    </>
  );
  const klassen = cn(
    "group block min-w-0 rounded-xl border border-hairline bg-surface p-5 schatten-karte transition-colors",
    href && "hover:border-input hover:bg-surface-muted/60",
    className,
  );
  if (href)
    return (
      <Link to={href} title={title} className={klassen}>
        {inhalt}
      </Link>
    );
  return (
    <div className={klassen} title={title}>
      {inhalt}
    </div>
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
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
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
        "rounded-xl border border-hairline bg-surface schatten-karte",
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
      className="inline-flex h-8 items-center gap-0.5 rounded-md border border-hairline bg-surface-muted p-0.5"
    >
      {optionen.map((o) => (
        <button
          key={o.wert}
          role="radio"
          aria-checked={o.wert === wert}
          onClick={() => onChange(o.wert)}
          className={cn(
            "h-full cursor-pointer rounded-[5px] px-2.5 text-xs font-medium text-text-muted transition-colors duration-150 hover:text-foreground",
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
