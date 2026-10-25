import { useMemo, useState } from "react";
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
import { aktivitaetenSicht } from "@/lib/akquise/berechnen";
import {
  MASSNAHME_LABEL,
  MASSNAHMEN_REIHENFOLGE,
} from "@/lib/akquise/klassifizieren";
import type {
  AkquiseDto,
  AktivitaetenFilter,
  Massnahme,
} from "@/lib/akquise/typen";
import { formatInt } from "@/lib/format";

import { AnschreibenAnnahme, FilterLeiste } from "./bausteine";
import { GRUPPEN, gruppiereMonat } from "./hilfen";

const gruppenConfig = Object.fromEntries(
  GRUPPEN.map((g, i) => [g.id, { label: g.label, color: VIZ[i] }]),
) satisfies ChartConfig;

const gruppenLabels = Object.fromEntries(GRUPPEN.map((g) => [g.id, g.label]));

const ZEITRAUM_LABEL: Record<number, string> = {
  3: "3 Monate",
  6: "6 Monate",
  12: "12 Monate",
  24: "24 Monate",
};

function veraenderung(jetzt: number, vorher: number): string {
  if (!vorher) return "Vorzeitraum: keine";
  const p = ((jetzt - vorher) / vorher) * 100;
  return `Vorzeitraum ${formatInt(vorher)} (${p >= 0 ? "+" : ""}${Math.round(p)} %)`;
}

/** Dashboard aller Akquise-Aktivitäten aus Salesforce. */
export function UebersichtTab({ daten }: { daten: AkquiseDto }) {
  const [filter, setFilter] = useState<AktivitaetenFilter>({
    monate: 12,
    person: null,
    bereich: "akquise",
  });
  const sicht = useMemo(
    () =>
      aktivitaetenSicht(
        daten.aktivitaeten.verlauf,
        filter,
        daten.stand.slice(0, 10),
      ),
    [daten, filter],
  );
  const summe = (m: Massnahme, feld: "zeitraum" | "vorzeitraum" = "zeitraum") =>
    sicht.summen.find((s) => s.massnahme === m)?.[feld] ?? 0;
  const zr = ZEITRAUM_LABEL[filter.monate] ?? `${filter.monate} Monate`;
  const a = daten.anschreiben;
  const pool = daten.pool.reduce((s, p) => s + p.anzahl, 0);
  const termine = summe("akquise_termin");
  const nachfassen = summe("nachfassen") + summe("proaktiv");

  const funnel = [
    {
      name: "Eigentümer im Recherche-Pool",
      wert: pool,
      zusatz: "alle Uploads, gemeinsam mit FRENKEN",
    },
    {
      name: "Von Grenz angeschrieben (Brief versendet)",
      wert: a.leadsAngeschrieben,
      zusatz: `${formatInt(a.leadsNurVorbereitet)} weitere nur vorbereitet`,
    },
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
    sicht.jePerson.some((p) => (p[m] ?? 0) > 0),
  );

  return (
    <div className="flex flex-col gap-6">
      <FilterLeiste
        filter={filter}
        personen={sicht.personen}
        onChange={setFilter}
      />
      <KachelReihe>
        <Kachel
          titel={`Briefe versendet (${zr})`}
          wert={formatInt(summe("anschreiben"))}
          unterzeile={`${veraenderung(summe("anschreiben"), summe("anschreiben", "vorzeitraum"))} · ${formatInt(a.offen)} vorbereitet, nicht versendet`}
        />
        <Kachel
          titel={`Anrufe (${zr})`}
          wert={formatInt(summe("anruf"))}
          unterzeile={veraenderung(
            summe("anruf"),
            summe("anruf", "vorzeitraum"),
          )}
        />
        <Kachel
          titel="Objektaufnahmen / Einwertungen"
          wert={formatInt(termine)}
          unterzeile={`${zr} · ${veraenderung(termine, summe("akquise_termin", "vorzeitraum"))}`}
        />
        <Kachel
          titel="Nachfassen & proaktive Akquise"
          wert={formatInt(nachfassen)}
          unterzeile={`erledigt in ${zr} · ${formatInt(summe("email"))} E-Mails`}
        />
      </KachelReihe>
      <KachelReihe>
        <Kachel
          titel="Reaktionsquote Anschreiben"
          wert={prozent(a.reaktionsquote, 1)}
          unterzeile={`Interesse: ${prozent(a.interessequote, 1)} · gesamt, ohne Filter`}
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
        titel="Aktivitäten je Monat"
        hinweis="Erledigte Aufgaben und Termine in Salesforce. Offene Aufgaben (auch vorbereitete Briefe) zählen erst, wenn sie erledigt sind."
      >
        <ChartContainer config={gruppenConfig} className="h-72 w-full">
          <BarChart
            data={sicht.jeMonat.map((z) => ({
              name: monatLabel(z.monat, true),
              ...gruppiereMonat(z),
            }))}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="name"
              tickLine={false}
              axisLine={false}
              interval={filter.monate > 12 ? 2 : 0}
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

      <AnschreibenAnnahme offen={a.offen} />

      <div className="grid gap-6 xl:grid-cols-2">
        <Karte
          titel="Vom Eigentümer zum Mandat"
          hinweis="Jede Stufe zählt Eigentümer bzw. Mandate, nicht Briefe."
        >
          <BalkenListe zeilen={funnel} />
        </Karte>
        <Karte titel={`Aktivitäten: letzte ${zr} gegen den Zeitraum davor`}>
          <Tabelle
            kopf={[
              { titel: "Maßnahme" },
              { titel: zr, rechts: true },
              { titel: "davor", rechts: true },
            ]}
            leer={sicht.summen.length ? null : "Keine Aktivitäten."}
          >
            {MASSNAHMEN_REIHENFOLGE.map((m) =>
              sicht.summen.find((s) => s.massnahme === m),
            )
              .filter((s): s is NonNullable<typeof s> => Boolean(s))
              .map((s) => (
                <tr key={s.massnahme}>
                  <td className={zelle}>{MASSNAHME_LABEL[s.massnahme]}</td>
                  <td className={zelleRechts}>{formatInt(s.zeitraum)}</td>
                  <td className={zelleRechts}>{formatInt(s.vorzeitraum)}</td>
                </tr>
              ))}
          </Tabelle>
        </Karte>
      </div>

      <Karte titel={`Aktivitäten je Person (${zr})`}>
        <Tabelle
          kopf={[
            { titel: "Person" },
            ...personenSpalten.map((m) => ({
              titel: MASSNAHME_LABEL[m],
              rechts: true,
            })),
            { titel: "Gesamt", rechts: true },
          ]}
          leer={sicht.jePerson.length ? null : "Keine Aktivitäten."}
        >
          {sicht.jePerson.map((p) => (
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
