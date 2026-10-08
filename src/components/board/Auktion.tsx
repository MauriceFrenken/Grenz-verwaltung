/**
 * Bausteine im Stil „Auktionssaal“: dunkle Bühne, große Zahlen, Countdown,
 * Los-Karten und Laufband. Farben nur über Tokens (styles.css: --brand, --stage*).
 */
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { countdown, countdownTage } from "@/lib/format/countdown";
import { euroKompaktTeile } from "@/lib/format/de";
import { cn } from "@/lib/utils";
import type { Ampel } from "./ampel";
import { useHochzaehlen, useJetzt } from "./useAuktion";

// ---------------------------------------------------------------------------
// Bühne (dunkles Live-Band)
// ---------------------------------------------------------------------------

/** Dunkle Fläche über die volle Inhaltsbreite (gleicht das Padding des Rahmens aus). */
export function Buehne({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "drucken-hell relative -mx-4 -mt-8 mb-8 overflow-hidden bg-stage px-4 pb-7 pt-7 text-stage-foreground md:-mx-8 md:px-8",
        className,
      )}
    >
      {/* feine Orange-Kante unten wie ein Auktions-Ticker */}
      <span
        className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-brand via-brand/40 to-transparent"
        aria-hidden
      />
      {children}
    </section>
  );
}

/** Kleiner pulsierender Punkt „live“. */
export function LivePunkt({ className }: { className?: string }) {
  return (
    <span
      className={cn("live-punkt inline-block size-2 bg-brand", className)}
      aria-hidden
    />
  );
}

/** Überschrift in Versalien für Bühne und Los-Karten. */
export function Etikett({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "text-[11px] font-semibold uppercase tracking-[0.12em]",
        className,
      )}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Große Zahl
// ---------------------------------------------------------------------------

/** Großer Euro-Betrag mit kleiner Einheit; zählt beim ersten Anzeigen hoch. */
export function GrosserBetrag({
  wert,
  className,
  einheitClassName,
}: {
  wert: number | null | undefined;
  className?: string;
  einheitClassName?: string;
}) {
  const ziel = wert ?? 0;
  const animiert = useHochzaehlen(ziel);
  const { zahl, einheit } = euroKompaktTeile(wert == null ? null : animiert);
  // Einheit muss zum Zielwert passen (sonst springt „Tsd.“ auf „Mio.“)
  const zielEinheit = euroKompaktTeile(wert).einheit;
  const anzeige = einheit === zielEinheit ? zahl : euroKompaktTeile(wert).zahl;
  return (
    <span
      className={cn("ziffern inline-flex items-baseline gap-1.5", className)}
    >
      <span>{anzeige}</span>
      {zielEinheit ? (
        <span
          className={cn(
            "text-[0.42em] font-medium tracking-normal opacity-70",
            einheitClassName,
          )}
        >
          {zielEinheit}
        </span>
      ) : null}
    </span>
  );
}

/** Große Ganzzahl (z. B. Anzahl), zählt hoch. */
export function GrosseZahl({
  wert,
  einheit,
  className,
}: {
  wert: number;
  einheit?: string;
  className?: string;
}) {
  const animiert = useHochzaehlen(wert);
  return (
    <span
      className={cn("ziffern inline-flex items-baseline gap-1.5", className)}
    >
      <span>{Math.round(animiert).toLocaleString("de-DE")}</span>
      {einheit ? (
        <span className="text-[0.42em] font-medium tracking-normal opacity-70">
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
 * ab Stichtag, danach läuft die Uhr minütlich.
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
        c.ueberfaellig ? "text-bad" : c.dringend ? "text-brand-text" : "",
        className,
      )}
      title={ziel}
    >
      {text}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Los-Karte
// ---------------------------------------------------------------------------

const AMPEL_KANTE: Record<Ampel, string> = {
  gruen: "bg-ok",
  gelb: "bg-warn",
  rot: "bg-bad",
  grau: "bg-hairline",
};

const AMPEL_TEXT: Record<Ampel, string> = {
  gruen: "in Ordnung",
  gelb: "prüfen",
  rot: "handeln",
  grau: "Daten fehlen",
};

export interface LosKarteProps {
  /** Losnummer, z. B. „BM-2026-005“ oder „DL-2023-016“ */
  los: string;
  titel: string;
  untertitel?: ReactNode;
  /** Hauptzahl, z. B. Einstand oder Restschuld */
  wert?: ReactNode;
  wertLabel?: string;
  /** rechts oben, z. B. Countdown oder Standzeit */
  uhr?: ReactNode;
  uhrLabel?: string;
  ampel?: Ampel;
  /** kurzer Statustext als Chip */
  status?: string;
  /** nächster Schritt in einer Zeile */
  schritt?: ReactNode;
  href?: string;
  search?: Record<string, unknown>;
  onClick?: () => void;
  className?: string;
}

/** Karte im Stil eines Auktionsloses: Nummer, Titel, Hauptzahl, Uhr, Status. */
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
      <span
        className={cn("absolute inset-x-0 top-0 h-[3px]", AMPEL_KANTE[ampel])}
        aria-hidden
      />
      <div className="flex items-center justify-between gap-2">
        <span className="ziffern text-[11px] font-semibold uppercase tracking-[0.12em] text-text-subtle">
          Los {los}
        </span>
        {status ? (
          <span className="border border-hairline px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">
            {status}
          </span>
        ) : null}
      </div>
      <div className="mt-2 min-w-0">
        <div className="truncate text-[15px] font-semibold leading-snug text-heading">
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
            <div className="text-[11px] text-text-subtle">{wertLabel}</div>
          ) : null}
          <div className="ziffern text-[22px] font-semibold leading-none tracking-[-0.02em] text-heading">
            {wert ?? "–"}
          </div>
        </div>
        {uhr ? (
          <div className="shrink-0 text-right">
            {uhrLabel ? (
              <div className="text-[11px] text-text-subtle">{uhrLabel}</div>
            ) : null}
            <div className="ziffern text-sm font-semibold leading-none">
              {uhr}
            </div>
          </div>
        ) : null}
      </div>
      {schritt ? (
        <div className="mt-3 flex items-center gap-1.5 border-t border-hairline pt-2.5 text-xs text-text-muted">
          <span className="sr-only">Ampel: {AMPEL_TEXT[ampel]}. </span>
          <span className="min-w-0 flex-1 truncate">{schritt}</span>
          {href ? (
            <ArrowUpRight
              className="size-3.5 shrink-0 text-text-subtle transition-colors group-hover:text-brand-text"
              aria-hidden
            />
          ) : null}
        </div>
      ) : (
        <span className="sr-only">Ampel: {AMPEL_TEXT[ampel]}</span>
      )}
    </>
  );
  const klassen = cn(
    "group relative block min-w-0 border border-hairline bg-surface p-4 pt-5 text-left transition-[border-color,transform] duration-150",
    (href || onClick) &&
      "cursor-pointer hover:-translate-y-px hover:border-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
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

// ---------------------------------------------------------------------------
// Laufband
// ---------------------------------------------------------------------------

export interface LaufbandEintrag {
  id: string;
  datum: string;
  kuerzel: string;
  text: string;
  betrag: number;
}

/**
 * Laufband der letzten Bankbuchungen. Läuft endlos (Inhalt doppelt), hält bei
 * Hover und Fokus an und steht bei reduzierter Bewegung still.
 */
export function Laufband({
  eintraege,
  format,
  label = "Letzte Bankbuchungen",
}: {
  eintraege: LaufbandEintrag[];
  format: (betrag: number) => string;
  label?: string;
}) {
  if (!eintraege.length) return null;
  const dauer = Math.max(30, eintraege.length * 6);
  const liste = (versteckt: boolean) => (
    <ul
      className="flex shrink-0 items-center"
      aria-hidden={versteckt || undefined}
    >
      {eintraege.map((e) => (
        <li
          key={`${versteckt ? "b" : "a"}-${e.id}`}
          className="flex items-center gap-2 whitespace-nowrap border-r border-stage-line px-5 text-xs"
        >
          <span className="ziffern text-stage-muted">{e.datum}</span>
          <span className="font-semibold text-stage-foreground">
            {e.kuerzel}
          </span>
          <span className="max-w-[260px] truncate text-stage-muted">
            {e.text}
          </span>
          <span
            className={cn(
              "ziffern font-semibold",
              e.betrag >= 0 ? "text-[#5ee09a]" : "text-stage-foreground",
            )}
          >
            {format(e.betrag)}
          </span>
        </li>
      ))}
    </ul>
  );
  return (
    <div
      className="laufband nicht-drucken relative -mx-4 mb-8 flex h-9 items-center overflow-hidden border-y border-stage-line bg-stage-raised md:-mx-8"
      role="region"
      aria-label={label}
      tabIndex={0}
    >
      <span className="z-10 flex h-full shrink-0 items-center gap-2 bg-brand px-3 text-[11px] font-bold uppercase tracking-[0.12em] text-black">
        Live
      </span>
      <div
        className="laufband-spur flex w-max"
        style={{ ["--laufband-dauer" as string]: `${dauer}s` }}
      >
        {liste(false)}
        {liste(true)}
      </div>
    </div>
  );
}
