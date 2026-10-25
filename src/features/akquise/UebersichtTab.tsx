import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  AnzahlTooltip,
  BalkenListe,
  Kachel,
  KachelReihe,
  Karte,
  Tabelle,
} from "@/features/kennzahlen/bausteine";
import {
  VIZ,
  monatLabel,
  prozent,
  zelle,
  zelleRechts,
} from "@/features/kennzahlen/hilfen";
import {
  MASSNAHME_LABEL,
  MASSNAHMEN_REIHENFOLGE,
} from "@/lib/akquise/klassifizieren";
import type { AkquiseDto, Massnahme } from "@/lib/akquise/typen";
import { formatInt } from "@/lib/format";

import { GRUPPEN, gruppiereMonat } from "./hilfen";

const gruppenConfig = Object.fromEntries(
  GRUPPEN.map((g, i) => [g.id, { label: g.label, color: VIZ[i] }]),
) satisfies ChartConfig;

const gruppenLabels = Object.fromEntries(GRUPPEN.map((g) => [g.id, g.label]));

function summe(
  d: AkquiseDto,
  m: Massnahme,
  feld: "jahr" | "vorjahr" = "jahr",
): number {
  return d.aktivitaeten.summen.find((s) => s.massnahme === m)?.[feld] ?? 0;
}

function veraenderung(jahr: number, vorjahr: number): string {
  if (!vorjahr) return "Vorjahr: keine";
  const p = ((jahr - vorjahr) / vorjahr) * 100;
  return `Vorjahr ${formatInt(vorjahr)} (${p >= 0 ? "+" : ""}${Math.round(p)} %)`;
}

/** Dashboard aller Akquise-Aktivitäten aus Salesforce. */
export function UebersichtTab({ daten }: { daten: AkquiseDto }) {
  const a = daten.anschreiben;
  const pool = daten.pool.reduce((s, p) => s + p.anzahl, 0);
  const termine = summe(daten, "akquise_termin");
  const nachfassen = summe(daten, "nachfassen") + summe(daten, "proaktiv");

  const funnel = [
    {
      name: "Eigentümer im Recherche-Pool",
      wert: pool,
      zusatz: "alle Uploads, gemeinsam mit FRENKEN",
    },
    { name: "Von Grenz angeschrieben", wert: a.leadsAngeschrieben },
    {
      name: "Reaktion (Kontakt oder Absage)",
      wert: a.ergebnisse
        .filter((e) =>
          ["mandat", "interesse", "kontakt", "absage"].includes(e.ergebnis),
        )
        .reduce((s, e) => s + e.anzahl, 0),
    },
    {
      name: "Interesse / qualifiziert",
      wert: a.ergebnisse
        .filter((e) => e.ergebnis === "interesse" || e.ergebnis === "mandat")
        .reduce((s, e) => s + e.anzahl, 0),
    },
    {
      name: "Mandate in Akquisition oder Einwertung",
      wert: daten.mandate.akquisition + daten.mandate.einwertung,
    },
    {
      name: "Beauftragt (letzte 12 Monate)",
      wert: daten.mandate.beauftragt12m,
    },
  ];

  const personenSpalten = MASSNAHMEN_REIHENFOLGE.filter((m) =>
    daten.aktivitaeten.jePerson.some((p) => (p[m] ?? 0) > 0),
  );

  return (
    <div className="flex flex-col gap-6">
      <KachelReihe>
        <Kachel
          titel="Anschreiben (12 Monate)"
          wert={formatInt(a.briefe12m)}
          unterzeile={veraenderung(
            a.briefe12m,
            summe(daten, "anschreiben", "vorjahr"),
          )}
        />
        <Kachel
          titel="Anrufe (12 Monate)"
          wert={formatInt(summe(daten, "anruf"))}
          unterzeile={veraenderung(
            summe(daten, "anruf"),
            summe(daten, "anruf", "vorjahr"),
          )}
        />
        <Kachel
          titel="Objektaufnahmen / Einwertungen"
          wert={formatInt(termine)}
          unterzeile={`12 Monate · ${veraenderung(termine, summe(daten, "akquise_termin", "vorjahr"))}`}
        />
        <Kachel
          titel="Nachfassen & proaktive Akquise"
          wert={formatInt(nachfassen)}
          unterzeile="erledigt in 12 Monaten"
        />
      </KachelReihe>
      <KachelReihe>
        <Kachel
          titel="Reaktionsquote Anschreiben"
          wert={prozent(a.reaktionsquote, 1)}
          unterzeile={`Interesse: ${prozent(a.interessequote, 1)} der angeschriebenen Eigentümer`}
        />
        <Kachel
          titel="Nachfassquote"
          wert={prozent(a.nachfassquote)}
          unterzeile="Briefe mit Anruf/E-Mail danach (ab 3 Wochen)"
          ton={
            a.nachfassquote !== null && a.nachfassquote < 30
              ? "schlecht"
              : undefined
          }
        />
        <Kachel
          titel="Offene Wiedervorlagen"
          wert={formatInt(daten.wiedervorlagen.gesamt)}
          unterzeile={`davon ${formatInt(daten.wiedervorlagen.ueberfaellig)} überfällig`}
          ton={daten.wiedervorlagen.ueberfaellig > 0 ? "schlecht" : undefined}
        />
        <Kachel
          titel="Briefe zum Nachfassen"
          wert={formatInt(daten.nachfassen.gesamt)}
          unterzeile="ohne Reaktion und ohne Anruf danach"
          ton={daten.nachfassen.gesamt > 0 ? "schlecht" : undefined}
        />
      </KachelReihe>

      <Karte
        titel="Akquise-Aktivitäten je Monat"
        hinweis="Erledigte Aufgaben und Termine in Salesforce, Anschreiben nach Erstellung. Offene Aufgaben zählen erst, wenn sie erledigt sind."
      >
        <ChartContainer config={gruppenConfig} className="h-72 w-full">
          <BarChart
            data={daten.aktivitaeten.jeMonat.map((z) => ({
              name: monatLabel(z.monat, true),
              ...gruppiereMonat(z),
            }))}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="name"
              tickLine={false}
              axisLine={false}
              interval={1}
            />
            <YAxis tickLine={false} axisLine={false} width={40} />
            <ChartTooltip content={<AnzahlTooltip labels={gruppenLabels} />} />
            <ChartLegend content={<ChartLegendContent />} />
            {GRUPPEN.map((g) => (
              <Bar
                key={g.id}
                dataKey={g.id}
                stackId="a"
                fill={`var(--color-${g.id})`}
                stroke="var(--surface)"
                strokeWidth={1}
              />
            ))}
          </BarChart>
        </ChartContainer>
      </Karte>

      <div className="grid gap-6 xl:grid-cols-2">
        <Karte
          titel="Vom Eigentümer zum Mandat"
          hinweis="Jede Stufe zählt Eigentümer bzw. Mandate, nicht Briefe."
        >
          <BalkenListe zeilen={funnel} />
        </Karte>
        <Karte titel="Aktivitäten: letzte 12 Monate gegen Vorjahr">
          <Tabelle
            kopf={[
              { titel: "Maßnahme" },
              { titel: "12 Monate", rechts: true },
              { titel: "Vorjahr", rechts: true },
            ]}
            leer={
              daten.aktivitaeten.summen.length ? null : "Keine Aktivitäten."
            }
          >
            {MASSNAHMEN_REIHENFOLGE.map((m) =>
              daten.aktivitaeten.summen.find((s) => s.massnahme === m),
            )
              .filter((s): s is NonNullable<typeof s> => Boolean(s))
              .map((s) => (
                <tr key={s.massnahme}>
                  <td className={zelle}>{MASSNAHME_LABEL[s.massnahme]}</td>
                  <td className={zelleRechts}>{formatInt(s.jahr)}</td>
                  <td className={zelleRechts}>{formatInt(s.vorjahr)}</td>
                </tr>
              ))}
          </Tabelle>
        </Karte>
      </div>

      <Karte titel="Aktivitäten je Person (12 Monate)">
        <Tabelle
          kopf={[
            { titel: "Person" },
            ...personenSpalten.map((m) => ({
              titel: MASSNAHME_LABEL[m],
              rechts: true,
            })),
            { titel: "Gesamt", rechts: true },
          ]}
          leer={
            daten.aktivitaeten.jePerson.length ? null : "Keine Aktivitäten."
          }
        >
          {daten.aktivitaeten.jePerson.map((p) => (
            <tr key={p.person}>
              <td className={zelle}>{p.person}</td>
              {personenSpalten.map((m) => (
                <td key={m} className={zelleRechts}>
                  {formatInt(p[m] ?? 0)}
                </td>
              ))}
              <td className={`${zelleRechts} font-medium`}>
                {formatInt(p.gesamt)}
              </td>
            </tr>
          ))}
        </Tabelle>
      </Karte>
    </div>
  );
}
