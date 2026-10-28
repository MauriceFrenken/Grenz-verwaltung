import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ExternalLink, Loader2 } from "lucide-react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { useAuth } from "@/hooks/useAuth";
import { apiFehlermeldung } from "@/lib/apiFehlermeldung";
import { formatDate } from "@/lib/format";
import {
  GRUPPEN,
  periodeText,
  type IndikatorStand,
} from "@/lib/markt/indikatoren";
import type { MarktUmfeldDto } from "@/lib/markt/server-fn";
import { MINDEST_FALLZAHL, type Verteilung } from "@/lib/marktbericht/typen";

import { Karte, Tabelle } from "./bausteine";
import { VIZ, euroKurz, zelle, zelleRechts } from "./hilfen";

function zahl(n: number, stellen: number): string {
  return n.toLocaleString("de-DE", {
    minimumFractionDigits: stellen,
    maximumFractionDigits: stellen,
  });
}

/** Angezeigter Wert: Veränderungen mit Vorzeichen, Stände mit Einheit. */
function wertText(s: IndikatorStand, wert = s.wert): string {
  if (s.darstellung === "vorjahr")
    return `${wert > 0 ? "+" : wert < 0 ? "−" : "±"}${zahl(Math.abs(wert), s.stellen)} %`;
  if (s.einheit === "-fach") return `${zahl(wert, s.stellen)}-fach`;
  if (s.einheit === "Tsd.") return `${zahl(wert, s.stellen)} Tsd.`;
  return `${zahl(wert, s.stellen)} ${s.einheit}`;
}

function vergleichText(s: IndikatorStand): string | null {
  if (s.vorjahr === null) return null;
  if (s.darstellung === "vorjahr")
    return `ein Jahr zuvor ${wertText(s, s.vorjahr)}`;
  const diff = s.wert - s.vorjahr;
  if (s.einheit === "%") {
    const bp = Math.round(diff * 100);
    return `${bp > 0 ? "+" : bp < 0 ? "−" : "±"}${Math.abs(bp)} Basispunkte ggü. Vorjahr`;
  }
  const prozent = s.vorjahr ? (diff / s.vorjahr) * 100 : 0;
  return `${prozent > 0 ? "+" : prozent < 0 ? "−" : "±"}${zahl(Math.abs(prozent), 1)} % ggü. Vorjahr`;
}

const verlaufConfig = {
  wert: { label: "Wert", color: VIZ[0] },
} satisfies ChartConfig;

function Indikator({ s }: { s: IndikatorStand }) {
  const vergleich = vergleichText(s);
  return (
    <div className="flex flex-col gap-1.5 border border-hairline border-l-[3px] border-l-[var(--gc-hellblau)] bg-surface p-4">
      <span className="label-caps text-text-muted">{s.label}</span>
      <div className="flex items-end justify-between gap-3">
        <span className="text-[1.75rem] font-light leading-tight tabular-nums text-heading">
          {wertText(s)}
        </span>
        {s.verlauf.length > 2 ? (
          <ChartContainer
            config={verlaufConfig}
            className="h-10 w-28 shrink-0 [&_.recharts-surface]:overflow-visible"
          >
            <LineChart
              data={s.verlauf}
              margin={{ top: 4, bottom: 4, left: 0, right: 0 }}
            >
              <YAxis hide domain={["dataMin", "dataMax"]} />
              <Line
                dataKey="wert"
                type="monotone"
                stroke="var(--color-wert)"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ChartContainer>
        ) : null}
      </div>
      <span className="text-xs text-text-muted">
        {s.darstellung === "vorjahr" ? "ggü. Vorjahr · " : ""}
        {periodeText(s.periode)}
        {vergleich ? ` · ${vergleich}` : ""}
      </span>
      <p className="text-xs text-heading/80">{s.hinweis}</p>
      <span className="mt-auto pt-1 text-[11px] text-text-subtle">
        Quelle: {s.quelle}
      </span>
    </div>
  );
}

const zinsConfig = {
  bauzins: { label: "Bauzins >10 J.", color: VIZ[0] },
  bund10: { label: "Bundesanleihe 10 J.", color: VIZ[1] },
  ezb: { label: "EZB-Einlagesatz", color: VIZ[2] },
  inflation: { label: "Inflation", color: VIZ[3] },
} satisfies ChartConfig;

function ZinsChart({ indikatoren }: { indikatoren: IndikatorStand[] }) {
  const ids = Object.keys(zinsConfig) as (keyof typeof zinsConfig)[];
  const monate = new Map<string, Record<string, number | string>>();
  for (const id of ids) {
    const s = indikatoren.find((i) => i.id === id);
    for (const w of s?.verlauf ?? []) {
      const zeile = monate.get(w.periode) ?? { monat: w.periode };
      zeile[id] = w.wert;
      monate.set(w.periode, zeile);
    }
  }
  const daten = [...monate.values()].sort((a, b) =>
    String(a.monat).localeCompare(String(b.monat)),
  );
  if (daten.length < 3) return null;
  return (
    <Karte
      titel="Zinsen und Inflation seit 5 Jahren"
      hinweis="Monatswerte in %. Inflation als Veränderung der Verbraucherpreise zum Vorjahresmonat."
    >
      <ChartContainer config={zinsConfig} className="h-64 w-full">
        <LineChart data={daten}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="monat"
            tickLine={false}
            axisLine={false}
            minTickGap={40}
            tickFormatter={(m: string) => periodeText(m)}
          />
          <YAxis tickLine={false} axisLine={false} width={32} />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(m) => periodeText(String(m))}
              />
            }
          />
          <ChartLegend content={<ChartLegendContent />} />
          {ids.map((id) => (
            <Line
              key={id}
              dataKey={id}
              type="monotone"
              stroke={`var(--color-${id})`}
              strokeWidth={id === "bauzins" ? 2.5 : 1.5}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ChartContainer>
    </Karte>
  );
}

function median(v: Verteilung | null, format: (n: number) => string): string {
  if (!v || v.n < MINDEST_FALLZAHL) return "–";
  return format(v.median);
}

function Angebotsfaktoren({ d }: { d: MarktUmfeldDto }) {
  const zeilen = d.angebot.zeilen.filter((z) => z.angebote > 0);
  return (
    <Karte
      titel="Angebotsfaktoren Zinshäuser (eigene Erhebung)"
      hinweis={`Median der Exposés im Ankauf-Postfach vom ${formatDate(d.angebot.von)} bis ${formatDate(d.angebot.bis)}, Angebotspreise. Unter ${MINDEST_FALLZAHL} Fällen kein Wert. ${d.kaeufer.profile} aktive Ankaufsprofile in Salesforce${d.kaeufer.medianVolumenMax ? `, Median-Ticket bis ${euroKurz(d.kaeufer.medianVolumenMax)}` : ""}.`}
    >
      <Tabelle
        kopf={[
          { titel: "Teilmarkt" },
          { titel: "Angebote", rechts: true },
          { titel: "Faktor", rechts: true },
          { titel: "Bruttorendite", rechts: true },
          { titel: "Kaufpreis €/m²", rechts: true },
          { titel: "Miete €/m²", rechts: true },
        ]}
        leer={
          zeilen.length ? null : "Noch keine ausgelesenen Exposés im Zeitraum."
        }
      >
        {zeilen.map((z) => (
          <tr
            key={z.teilmarkt}
            className={z.teilmarkt === "Gesamt" ? "font-medium" : undefined}
          >
            <td className={zelle}>{z.teilmarkt}</td>
            <td className={zelleRechts}>{z.angebote}</td>
            <td className={zelleRechts}>
              {median(z.faktor, (n) => `${zahl(n, 1)}-fach`)}
            </td>
            <td className={zelleRechts}>
              {median(z.faktor, (n) => `${zahl(100 / n, 1)} %`)}
            </td>
            <td className={zelleRechts}>
              {median(
                z.preisM2,
                (n) => `${Math.round(n).toLocaleString("de-DE")} €`,
              )}
            </td>
            <td className={zelleRechts}>
              {median(z.mieteM2, (n) => `${zahl(n, 2)} €`)}
            </td>
          </tr>
        ))}
      </Tabelle>
      <Link
        to="/exposes/auswertung"
        className="self-start text-sm text-heading underline-offset-2 hover:underline"
      >
        Ganze Auswertung in der Exposéanalyse →
      </Link>
    </Karte>
  );
}

function Vergleichswerte({ d }: { d: MarktUmfeldDto }) {
  return (
    <Karte
      titel="Werte aus Marktberichten großer Häuser"
      hinweis="Geprüfte Zitate aus der Marktbericht-Bibliothek, je Haus der jüngste Bericht der letzten 18 Monate. Rheinland zuerst."
    >
      <Tabelle
        kopf={[
          { titel: "Kennzahl" },
          { titel: "Region" },
          { titel: "Wert", rechts: true },
          { titel: "Veränderung" },
          { titel: "Quelle" },
          { titel: "Stand" },
        ]}
        leer={
          d.vergleichswerte.length
            ? null
            : "Noch keine geprüften Werte in der Bibliothek."
        }
      >
        {d.vergleichswerte.map((b) => (
          <tr key={`${b.dokumentId}-${b.id}-${b.kennzahl}-${b.region}`}>
            <td className="px-2 py-2">{b.kennzahl}</td>
            <td className={zelle}>{b.region}</td>
            <td className={zelleRechts}>
              {b.wert.toLocaleString("de-DE", { maximumFractionDigits: 2 })}{" "}
              {b.einheit}
            </td>
            <td className={zelle}>{b.veraenderung ?? "–"}</td>
            <td className={zelle}>
              {b.url ? (
                <a
                  href={b.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-heading hover:underline"
                >
                  {b.quelle}
                  <ExternalLink className="size-3" />
                </a>
              ) : (
                b.quelle
              )}
            </td>
            <td className={zelle}>{formatDate(b.stichtag)}</td>
          </tr>
        ))}
      </Tabelle>
      {!d.vergleichswerte.length ? (
        <Link
          to="/tools/marktbericht"
          className="self-start text-sm text-heading underline-offset-2 hover:underline"
        >
          Bibliothek im Marktbericht-Tool →
        </Link>
      ) : null}
    </Karte>
  );
}

/** Kennzahlen › Markt: was man über den Immobilienmarkt im Kundengespräch wissen sollte. */
export function MarktumfeldTab() {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const {
    data: d,
    error,
    isLoading,
  } = useQuery({
    queryKey: ["markt-umfeld"],
    enabled: Boolean(token),
    staleTime: 60 * 60_000,
    queryFn: async () => {
      const { marktUmfeldLadenFn } = await import("@/lib/markt/server-fn");
      return marktUmfeldLadenFn({ data: { supabaseAccessToken: token } });
    },
  });

  if (!d) {
    return (
      <p className="flex items-center gap-2 text-sm text-text-muted">
        {isLoading ? <Loader2 className="size-4 animate-spin" /> : null}
        {error
          ? apiFehlermeldung(error)
          : isLoading
            ? "Marktdaten werden geladen …"
            : "Keine Daten."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-text-muted">
        Amtliche Reihen der Deutschen Bundesbank (mit Indizes von Destatis, vdp
        und bulwiengesa), Stand des Abrufs{" "}
        {new Date(d.abgerufenAm).toLocaleString("de-DE", {
          dateStyle: "short",
          timeStyle: "short",
        })}
        . Bei jedem Wert steht, auf welchen Zeitraum er sich bezieht.
      </p>
      {d.fehlend.length ? (
        <p className="border border-hairline bg-surface-muted px-4 py-2 text-xs text-text-muted">
          Gerade nicht abrufbar: {d.fehlend.join(", ")}.
        </p>
      ) : null}

      {GRUPPEN.map((g) => {
        const liste = d.indikatoren.filter((i) => i.gruppe === g.id);
        if (!liste.length) return null;
        return (
          <section key={g.id} className="flex flex-col gap-3">
            <div>
              <h2 className="text-[13px] font-medium uppercase tracking-[0.06em] text-heading">
                {g.label}
              </h2>
              <p className="text-xs text-text-muted">{g.hinweis}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {liste.map((s) => (
                <Indikator key={s.id} s={s} />
              ))}
            </div>
            {g.id === "zinsen" ? (
              <ZinsChart indikatoren={d.indikatoren} />
            ) : null}
          </section>
        );
      })}

      <Angebotsfaktoren d={d} />
      <Vergleichswerte d={d} />
    </div>
  );
}
