/**
 * Gemeinsame Bausteine der Steuerung: Seitenkopf, große Zahlen,
 * Countdown und Vorgangskarten. Farben nur über Tokens (styles.css).
 */
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { countdown, countdownTage } from "@/lib/format/countdown";
import { euroKompaktTeile } from "@/lib/format/de";
import { cn } from "@/lib/utils";
import { AMPEL_LABEL, type Ampel } from "./ampel";
import { useJetzt } from "./useJetzt";

// ---------------------------------------------------------------------------
// Seitenkopf-Fläche
// ---------------------------------------------------------------------------

/** Kopfbereich einer Seite: Titel, Aktionen und Kennzahlen über dem Inhalt. */
export function Buehne({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("drucken-hell mb-8", className)}>{children}</section>
  );
}

/** Kleiner Punkt „Daten aktuell“. */
export function LivePunkt({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block size-1.5 shrink-0 rounded-full bg-ok",
        className,
      )}
      aria-hidden
    />
  );
}

// ---------------------------------------------------------------------------
// Große Zahl
// ---------------------------------------------------------------------------

/** Großer Euro-Betrag mit kleiner Einheit, z. B. „1,07 Mio. €“. */
export function GrosserBetrag({
  wert,
  className,
  einheitClassName,
}: {
  wert: number | null | undefined;
  className?: string;
  einheitClassName?: string;
}) {
  const { zahl, einheit } = euroKompaktTeile(wert);
  return (
    <span className={cn("ziffern inline-flex items-baseline gap-1", className)}>
      <span>{zahl}</span>
      {einheit ? (
        <span
          className={cn(
            "text-[0.5em] font-medium tracking-normal text-text-muted",
            einheitClassName,
          )}
        >
          {einheit}
        </span>
      ) : null}
    </span>
  );
}

/** Große Ganzzahl (z. B. Anzahl). */
export function GrosseZahl({
  wert,
  einheit,
  className,
}: {
  wert: number;
  einheit?: string;
  className?: string;
}) {
  return (
    <span className={cn("ziffern inline-flex items-baseline gap-1", className)}>
      <span>{Math.round(wert).toLocaleString("de-DE")}</span>
      {einheit ? (
        <span className="text-[0.5em] font-medium tracking-normal text-text-muted">
          {einheit}
        </span>
      ) : null}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Countdown
// ---------------------------------------------------------------------------

/**
 * Countdown bis zu einem Datum. Server und erstes Rendern zeigen ganze Tage
 * ab Stichtag, danach wird mit der Uhrzeit gerechnet.
 */
export function Countdown({
  ziel,
  stichtag,
  className,
  vorsilbe = true,
}: {
  ziel: string;
  stichtag: string;
  className?: string;
  /** „in“ vor die Zeit setzen */
  vorsilbe?: boolean;
}) {
  const jetzt = useJetzt();
  const c = jetzt ? countdown(ziel, jetzt) : countdownTage(ziel, stichtag);
  const text =
    vorsilbe && !c.ueberfaellig && c.text !== "heute" ? `in ${c.text}` : c.text;
  return (
    <span
      className={cn(
        "ziffern whitespace-nowrap",
        c.ueberfaellig
          ? "text-bad"
          : c.dringend
            ? "text-warn"
            : "text-text-muted",
        className,
      )}
      title={ziel}
    >
      {text}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Vorgangskarte
// ---------------------------------------------------------------------------

const AMPEL_PILLE: Record<Ampel, string> = {
  gruen: "bg-ok-soft text-ok",
  gelb: "bg-warn-soft text-warn",
  rot: "bg-bad-soft text-bad",
  grau: "bg-surface-muted text-text-muted",
};

const AMPEL_PUNKT: Record<Ampel, string> = {
  gruen: "bg-ok",
  gelb: "bg-warn",
  rot: "bg-bad",
  grau: "bg-text-subtle",
};

export interface LosKarteProps {
  /** Kennung, z. B. „BM-2026-005“ oder „DL-2023-016“ */
  los: string;
  titel: string;
  untertitel?: ReactNode;
  /** Hauptzahl, z. B. Einstand oder Restschuld */
  wert?: ReactNode;
  wertLabel?: string;
  /** rechts, z. B. Countdown oder Standzeit */
  uhr?: ReactNode;
  uhrLabel?: string;
  ampel?: Ampel;
  /** kurzer Statustext als Pille; Standard ist der Ampeltext */
  status?: string;
  /** nächster Schritt in einer Zeile */
  schritt?: ReactNode;
  href?: string;
  search?: Record<string, unknown>;
  onClick?: () => void;
  className?: string;
}

/** Karte für einen Vorgang (Frist, Deal, Maschine): Kennung, Titel, Zahl, Termin, Status. */
export function LosKarte({
  los,
  titel,
  untertitel,
  wert,
  wertLabel,
  uhr,
  uhrLabel,
  ampel = "grau",
  status,
  schritt,
  href,
  search,
  onClick,
  className,
}: LosKarteProps) {
  const inhalt = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="ziffern truncate text-xs text-text-muted">{los}</span>
        <span
          className={cn(
            "inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full px-2 text-[11px] font-medium",
            AMPEL_PILLE[ampel],
          )}
        >
          <span
            className={cn("size-1.5 rounded-full", AMPEL_PUNKT[ampel])}
            aria-hidden
          />
          {status ?? AMPEL_LABEL[ampel]}
        </span>
      </div>
      <div className="mt-2.5 min-w-0">
        <div className="truncate text-sm font-semibold text-heading">
          {titel}
        </div>
        {untertitel ? (
          <div className="mt-0.5 truncate text-xs text-text-muted">
            {untertitel}
          </div>
        ) : null}
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          {wertLabel ? (
            <div className="text-[11px] text-text-muted">{wertLabel}</div>
          ) : null}
          <div className="ziffern mt-0.5 text-lg font-semibold leading-none tracking-[-0.02em] text-heading">
            {wert ?? "–"}
          </div>
        </div>
        {uhr ? (
          <div className="shrink-0 text-right">
            {uhrLabel ? (
              <div className="text-[11px] text-text-muted">{uhrLabel}</div>
            ) : null}
            <div className="ziffern mt-0.5 text-xs font-medium leading-none text-heading">
              {uhr}
            </div>
          </div>
        ) : null}
      </div>
      {schritt ? (
        <div className="mt-4 flex items-center gap-1.5 border-t border-hairline pt-3 text-xs text-text-muted">
          <span className="min-w-0 flex-1 truncate">{schritt}</span>
          {href ? (
            <ArrowUpRight
              className="size-3.5 shrink-0 text-text-subtle transition-colors group-hover:text-heading"
              aria-hidden
            />
          ) : null}
        </div>
      ) : null}
    </>
  );
  const klassen = cn(
    "group relative block min-w-0 rounded-lg border border-hairline bg-surface p-4 text-left schatten-karte transition-colors duration-150",
    (href || onClick) &&
      "cursor-pointer hover:border-input hover:bg-surface-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
    className,
  );
  if (href)
    return (
      <Link to={href} search={search as never} className={klassen}>
        {inhalt}
      </Link>
    );
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cn(klassen, "w-full")}>
        {inhalt}
      </button>
    );
  return <div className={klassen}>{inhalt}</div>;
}
