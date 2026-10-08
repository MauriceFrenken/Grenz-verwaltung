import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { STEUERUNG } from "@/modules/shell/navigation";
import { Buehne, Etikett, LivePunkt } from "./Auktion";

/**
 * Seitenkopf als dunkle Bühne („Auktionssaal“): Bereich und Managementfrage
 * der Seite als Etikett, Titel, Unterzeile, Aktionen rechts und optional
 * große Kennzahlen darunter.
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
  /** große Kennzahlen auf der Bühne */
  children?: ReactNode;
}) {
  const pfad = useRouterState({ select: (s) => s.location.pathname });
  const bereich = STEUERUNG.find((b) => b.eintraege.some((e) => e.to === pfad));
  const eintrag = bereich?.eintraege.find((e) => e.to === pfad);
  const marke =
    etikett ??
    (bereich && eintrag ? (
      <>
        {bereich.label}
        <span className="mx-2 text-stage-line">/</span>
        <span className="normal-case tracking-normal text-stage-muted">
          {eintrag.frage}
        </span>
      </>
    ) : null);
  return (
    <Buehne>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {marke ? (
            <div className="mb-2 flex items-center gap-2 text-brand">
              <LivePunkt />
              <Etikett>{marke}</Etikett>
            </div>
          ) : null}
          <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.025em] text-stage-foreground">
            {titel}
          </h1>
          {unterzeile ? (
            <p className="mt-1.5 max-w-3xl text-sm text-stage-muted">
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
      {children ? <div className="mt-7">{children}</div> : null}
    </Buehne>
  );
}

/** Kennzahl auf der Bühne: Etikett, große Zahl, Zusatz. */
export function BuehnenKennzahl({
  label,
  wert,
  hinweis,
  ampel,
  href,
  title,
}: {
  label: string;
  wert: ReactNode;
  hinweis?: ReactNode;
  ampel?: "gruen" | "gelb" | "rot" | "grau";
  href?: string;
  title?: string;
}) {
  const punkt =
    ampel === "rot"
      ? "bg-bad"
      : ampel === "gelb"
        ? "bg-warn"
        : ampel === "gruen"
          ? "bg-ok"
          : "bg-stage-line";
  const inhalt = (
    <>
      <div className="flex items-center gap-2 text-stage-muted">
        {ampel ? (
          <span className={cn("size-1.5 shrink-0", punkt)} aria-hidden />
        ) : null}
        <Etikett className="tracking-[0.1em]">{label}</Etikett>
      </div>
      <div className="mt-2 text-[34px] font-semibold leading-none tracking-[-0.03em] text-stage-foreground">
        {wert}
      </div>
      {hinweis ? (
        <div className="ziffern mt-2 text-xs text-stage-muted">{hinweis}</div>
      ) : null}
    </>
  );
  const klassen =
    "group block min-w-0 border-l border-stage-line pl-4 transition-colors";
  if (href)
    return (
      <Link
        to={href}
        title={title}
        className={cn(klassen, "hover:border-brand")}
      >
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
      className={cn(" border border-hairline bg-surface", className)}
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
      className="inline-flex h-8 items-center gap-0.5 border border-hairline bg-surface-muted p-0.5"
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
