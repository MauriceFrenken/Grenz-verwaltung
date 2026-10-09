/**
 * Bausteine des Cockpits: Kachelrahmen mit Datenstand, Balkenlisten,
 * Monatssäulen, Ring und Segmentbalken. Farben nur über Tokens.
 */
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ArrowUpRight, DatabaseZap } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Ampel } from "@/components/board/ampel";
import { AmpelPunkt } from "@/components/board/Status";
import { euroKompakt, prozent } from "@/lib/format/de";
import { cn } from "@/lib/utils";
import type { Balken, FrageAntwort, FrageStand } from "./logik/zehnFragen";

const AMPEL_FARBE: Record<Ampel, string> = {
  gruen: "var(--ok)",
  gelb: "var(--warn)",
  rot: "var(--bad)",
  grau: "var(--text-subtle)",
};

const STAND_PILLE: Record<FrageStand, { label: string; klasse: string }> = {
  echt: { label: "Echte Daten", klasse: "bg-ok-soft text-ok" },
  teilweise: { label: "Teilweise", klasse: "bg-warn-soft text-warn" },
  fehlt: { label: "Daten fehlen", klasse: "bg-surface-muted text-text-muted" },
  muster: { label: "Musterdaten", klasse: "bg-brand-soft text-brand-text" },
};

export function StandPille({
  stand,
  anzahl,
  gross,
}: {
  stand: FrageStand;
  anzahl?: number;
  gross?: boolean;
}) {
  const p = STAND_PILLE[stand];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full font-medium",
        gross ? "h-7 px-3 text-xs" : "h-5 px-2 text-[11px]",
        p.klasse,
      )}
    >
      {anzahl !== undefined ? <span className="ziffern">{anzahl}</span> : null}
      {p.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Kachel
// ---------------------------------------------------------------------------

/** Rahmen einer Cockpit-Kachel: Titel, Datenstand, Inhalt, Quelle. */
export function Kachel({
  a,
  titel,
  kopfzahl,
  unterzeile,
  children,
  className,
}: {
  a: FrageAntwort;
  titel: string;
  /** große Zahl oben; Standard ist die Antwort */
  kopfzahl?: ReactNode;
  unterzeile?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const fehlt = a.antwort === null;
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col rounded-xl border border-hairline bg-surface p-5 schatten-karte",
        className,
      )}
      title={a.frage}
    >
      <div className="flex items-start justify-between gap-3">
        <Link
          to={a.href}
          className="group inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.12em] text-text-muted hover:text-heading"
        >
          {titel}
          <ArrowUpRight
            className="size-3.5 text-text-subtle transition-colors group-hover:text-heading"
            aria-hidden
          />
        </Link>
        <StandPille stand={a.stand} />
      </div>
      {fehlt ? (
        <div className="mt-4 flex flex-1 flex-col items-start justify-center gap-2 rounded-lg border border-dashed border-input p-4">
          <DatabaseZap className="size-5 text-text-subtle" aria-hidden />
          <div className="text-sm font-medium text-heading">
            Noch keine verlässliche Zahl
          </div>
          <p className="text-xs text-text-muted">{a.hinweis}</p>
        </div>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-2.5">
            {a.ampel !== "grau" ? <AmpelPunkt ampel={a.ampel} /> : null}
            <span className="ziffern text-[32px] font-semibold leading-none tracking-[-0.03em] text-heading">
              {kopfzahl ?? a.antwort}
            </span>
          </div>
          <p className="mt-2 text-xs text-text-muted">
            {unterzeile ?? a.zusatz}
          </p>
          {children ? <div className="mt-5 flex-1">{children}</div> : null}
        </>
      )}
      <div className="mt-4 text-[11px] text-text-subtle">
        <span>Quelle: {a.quelle}</span>
        {a.stand === "teilweise" && a.hinweis ? (
          <span className="mt-0.5 line-clamp-2 block text-warn">
            {a.hinweis}
          </span>
        ) : null}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Balkenliste
// ---------------------------------------------------------------------------

/** Horizontale Balken mit Beschriftung links und Wert rechts. */
export function BalkenListe({
  balken,
  max: maxVorgabe,
  zeilen = 6,
  schwelle,
  schwelleLabel,
  leer = "Nichts offen",
}: {
  balken: Balken[];
  max?: number;
  zeilen?: number;
  schwelle?: number;
  schwelleLabel?: string;
  leer?: string;
}) {
  if (balken.length === 0)
    return (
      <p className="flex h-full min-h-16 items-center text-xs text-text-subtle">
        {leer}
      </p>
    );
  const sichtbar = balken.slice(0, zeilen);
  const max = Math.max(
    1,
    maxVorgabe ?? 0,
    schwelle ? schwelle * 1.25 : 0,
    ...balken.map((b) => Math.abs(b.wert)),
  );
  return (
    <div>
      <ul className="space-y-2.5">
        {sichtbar.map((b, i) => (
          <li
            key={i}
            className="grid items-center gap-3 text-xs"
            style={{
              gridTemplateColumns: `minmax(0,${schwelle ? "9rem" : "38%"}) minmax(2rem,1fr) ${schwelle ? "8rem" : "auto"}`,
            }}
            title={`${b.label}: ${b.text}`}
          >
            <span className="truncate text-text-muted">{b.label}</span>
            <span className="relative h-2 rounded-full bg-surface-muted">
              <span
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${Math.max(2, (Math.abs(b.wert) / max) * 100)}%`,
                  background: b.ampel ? AMPEL_FARBE[b.ampel] : "var(--brand)",
                }}
              />
              {schwelle ? (
                <span
                  className="absolute -inset-y-1 w-px bg-text-muted"
                  style={{ left: `${(schwelle / max) * 100}%` }}
                  aria-hidden
                />
              ) : null}
            </span>
            <span className="ziffern whitespace-nowrap text-right font-medium text-heading">
              {b.text}
            </span>
          </li>
        ))}
      </ul>
      {balken.length > zeilen || schwelle ? (
        <div className="mt-3 flex justify-between gap-3 text-[11px] text-text-subtle">
          <span>
            {balken.length > zeilen
              ? `+ ${balken.length - zeilen} weitere`
              : ""}
          </span>
          {schwelle ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-px bg-text-muted" aria-hidden />
              {schwelleLabel}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Säulen je Monat
// ---------------------------------------------------------------------------

export function MonatsSaeulen({
  balken,
  label,
  hoehe = 200,
}: {
  balken: Balken[];
  label: string;
  hoehe?: number;
}) {
  return (
    <figure aria-label={label} className="w-full">
      <ResponsiveContainer width="100%" height={hoehe}>
        <BarChart
          data={balken}
          margin={{ top: 8, right: 4, bottom: 0, left: 0 }}
          barCategoryGap="22%"
        >
          <CartesianGrid vertical={false} stroke="var(--hairline)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "var(--text-subtle)" }}
            tickLine={false}
            axisLine={false}
            interval={0}
          />
          <YAxis
            tickFormatter={(v: number) => euroKompakt(v)}
            tick={{ fontSize: 11, fill: "var(--text-subtle)" }}
            tickLine={false}
            axisLine={false}
            width={88}
          />
          <Tooltip
            cursor={{ fill: "var(--surface-muted)", opacity: 0.5 }}
            content={({ active, payload }) => {
              const b = payload?.[0]?.payload as Balken | undefined;
              return active && b ? (
                <div className="max-w-64 rounded-lg border border-hairline bg-elevated px-3 py-2 text-xs shadow-[0_8px_24px_-8px_rgb(0_0_0/0.4)]">
                  <div className="mb-0.5 font-medium text-heading">
                    {b.label}
                  </div>
                  <div className="text-text-muted">{b.text}</div>
                </div>
              ) : null;
            }}
          />
          <Bar dataKey="wert" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {balken.map((b, i) => (
              <Cell
                key={i}
                fill={
                  b.ampel === "rot" || b.ampel === "gelb"
                    ? AMPEL_FARBE[b.ampel]
                    : "var(--brand)"
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Ring
// ---------------------------------------------------------------------------

/** Ring aus Anteilen (z. B. pünktlich / abweichend / fehlt) mit Wert in der Mitte. */
export function Ring({
  balken,
  mitte,
  unter,
}: {
  balken: Balken[];
  mitte: string;
  unter: string;
}) {
  const summe = balken.reduce((s, b) => s + b.wert, 0);
  const r = 52;
  const umfang = 2 * Math.PI * r;
  const luecke =
    summe > 0 && balken.filter((b) => b.wert > 0).length > 1 ? 3 : 0;
  let start = 0;
  return (
    <div className="flex items-center gap-6">
      <svg
        viewBox="0 0 128 128"
        className="size-32 shrink-0 -rotate-90"
        role="img"
        aria-label={`${mitte} ${unter}`}
      >
        <circle
          cx="64"
          cy="64"
          r={r}
          fill="none"
          stroke="var(--surface-muted)"
          strokeWidth="12"
        />
        {summe > 0
          ? balken.map((b, i) => {
              const laenge = (b.wert / summe) * umfang;
              const seg = (
                <circle
                  key={i}
                  cx="64"
                  cy="64"
                  r={r}
                  fill="none"
                  stroke={b.ampel ? AMPEL_FARBE[b.ampel] : "var(--brand)"}
                  strokeWidth="12"
                  strokeDasharray={`${Math.max(0, laenge - luecke)} ${umfang}`}
                  strokeDashoffset={-start}
                >
                  <title>{`${b.label}: ${b.text}`}</title>
                </circle>
              );
              start += laenge;
              return b.wert > 0 ? seg : null;
            })
          : null}
        <text
          x="64"
          y="64"
          transform="rotate(90 64 64)"
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-heading text-[22px] font-semibold"
        >
          {mitte}
        </text>
      </svg>
      <ul className="min-w-0 flex-1 space-y-2 text-xs">
        {balken.map((b) => (
          <li key={b.label} className="flex items-center gap-2">
            {b.ampel ? <AmpelPunkt ampel={b.ampel} /> : null}
            <span className="flex-1 text-text-muted">{b.label}</span>
            <span className="ziffern font-medium text-heading">{b.text}</span>
          </li>
        ))}
        <li className="pt-1 text-[11px] text-text-subtle">{unter}</li>
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Segmentbalken (Anteile einer Summe)
// ---------------------------------------------------------------------------

const SEGMENT_FARBEN = ["var(--brand)", "#8e9cff", "#c3cbff", "#71717a"];

export function SegmentBalken({ balken }: { balken: Balken[] }) {
  const summe = balken.reduce((s, b) => s + Math.max(0, b.wert), 0);
  if (summe <= 0) return null;
  return (
    <div>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
        {balken.map((b, i) => (
          <span
            key={b.label}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${(b.wert / summe) * 100}%`,
              background: SEGMENT_FARBEN[i % SEGMENT_FARBEN.length],
            }}
            title={`${b.label}: ${b.text}`}
          />
        ))}
      </div>
      <ul className="mt-3 space-y-1.5 text-xs">
        {balken.map((b, i) => (
          <li key={b.label} className="flex items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-sm"
              style={{ background: SEGMENT_FARBEN[i % SEGMENT_FARBEN.length] }}
              aria-hidden
            />
            <span className="flex-1 truncate text-text-muted">{b.label}</span>
            <span className="ziffern font-medium text-heading">
              {prozent(b.wert / summe, 0)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Verlaufslinie ohne Achsen
// ---------------------------------------------------------------------------

export function Verlaufslinie({
  werte,
  hoehe = 56,
}: {
  werte: Array<{ datum: string; wert: number }>;
  hoehe?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={hoehe}>
      <AreaChart data={werte} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="vl-fl" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis hide domain={["dataMin", "dataMax"]} />
        <Area
          type="monotone"
          dataKey="wert"
          stroke="var(--brand)"
          strokeWidth={2}
          fill="url(#vl-fl)"
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Bedarf gegen Verfügbarkeit
// ---------------------------------------------------------------------------

export function BedarfBalken({
  bedarf,
  verfuegbar,
}: {
  bedarf: number;
  verfuegbar: number | null;
}) {
  const max = Math.max(1, bedarf, verfuegbar ?? 0);
  const zeile = (label: string, wert: number, farbe: string) => (
    <div className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-3 text-xs">
      <span className="text-text-muted">{label}</span>
      <span className="relative h-3 rounded-full bg-surface-muted">
        <span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${Math.max(2, (wert / max) * 100)}%`,
            background: farbe,
          }}
        />
      </span>
      <span className="ziffern font-medium text-heading">
        {euroKompakt(wert)}
      </span>
    </div>
  );
  return (
    <div className="space-y-2">
      {zeile(
        "EK-Bedarf",
        bedarf,
        verfuegbar !== null && bedarf > verfuegbar
          ? "var(--bad)"
          : "var(--brand)",
      )}
      {verfuegbar !== null ? (
        zeile("Frei verfügbar", verfuegbar, "var(--ok)")
      ) : (
        <p className="text-[11px] text-text-subtle">
          Frei verfügbares Eigenkapital erst mit Kontoständen
        </p>
      )}
    </div>
  );
}
