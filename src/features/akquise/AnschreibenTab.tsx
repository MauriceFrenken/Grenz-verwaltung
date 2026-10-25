import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
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
import { ERGEBNIS_LABEL } from "@/lib/akquise/klassifizieren";
import type { AkquiseDto } from "@/lib/akquise/typen";
import { formatInt } from "@/lib/format";

import { SfVerweis } from "./bausteine";
import { datum } from "./hilfen";

const briefeConfig = {
  anzahl: { label: "Anschreiben", color: VIZ[0] },
} satisfies ChartConfig;

function q(teil: number, gesamt: number): string {
  return gesamt ? prozent((teil / gesamt) * 100) : "–";
}

/** Eigentümer-Anschreiben: Versand, Reaktionen, Absagegründe und Nachfassliste. */
export function AnschreibenTab({ daten }: { daten: AkquiseDto }) {
  const a = daten.anschreiben;
  return (
    <div className="flex flex-col gap-6">
      <KachelReihe>
        <Kachel
          titel="Anschreiben gesamt"
          wert={formatInt(a.briefeGesamt)}
          unterzeile={`${formatInt(a.briefeErledigt)} als erledigt markiert · ${formatInt(a.briefe12m)} in 12 Monaten`}
        />
        <Kachel
          titel="Angeschriebene Eigentümer"
          wert={formatInt(a.leadsAngeschrieben)}
          unterzeile={`${formatInt(a.mehrfachAngeschrieben)} mehrfach angeschrieben`}
        />
        <Kachel
          titel="Reaktionsquote"
          wert={prozent(a.reaktionsquote, 1)}
          unterzeile={`Interesse/qualifiziert: ${prozent(a.interessequote, 1)}`}
        />
        <Kachel
          titel="Bewusst nicht angeschrieben"
          wert={formatInt(a.bewusstNichtAngeschrieben)}
          unterzeile={`meist Miteigentümer schon kontaktiert · ${formatInt(a.retouren)} Retouren`}
        />
      </KachelReihe>

      <div className="grid gap-6 xl:grid-cols-2">
        <Karte
          titel="Anschreiben je Monat"
          hinweis="Aufgaben „Send Letter“ der Grenz-User, nach Erledigung bzw. Erstellung."
        >
          <ChartContainer config={briefeConfig} className="h-64 w-full">
            <BarChart
              data={a.briefeJeMonat.map((z) => ({
                ...z,
                name: monatLabel(z.monat, true),
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
              <ChartTooltip
                content={<AnzahlTooltip labels={{ anzahl: "Anschreiben" }} />}
              />
              <Bar dataKey="anzahl" fill="var(--color-anzahl)" />
            </BarChart>
          </ChartContainer>
        </Karte>
        <Karte
          titel="Ergebnis je angeschriebenem Eigentümer"
          hinweis="Aus dem Lead-Status in Salesforce und Rückmeldungen nach dem ersten Brief."
        >
          <BalkenListe
            zeilen={a.ergebnisse
              .filter((e) => e.anzahl > 0)
              .map((e) => ({
                name: ERGEBNIS_LABEL[e.ergebnis],
                wert: e.anzahl,
                zusatz: q(e.anzahl, a.leadsAngeschrieben),
              }))}
          />
        </Karte>
      </div>

      <Karte
        titel="Reaktion nach Versandmonat"
        hinweis="Eigentümer nach Monat des ersten Anschreibens. Junge Monate haben naturgemäß noch weniger Reaktionen."
      >
        <Tabelle
          kopf={[
            { titel: "Monat" },
            { titel: "Angeschrieben", rechts: true },
            { titel: "Reaktion", rechts: true },
            { titel: "Quote", rechts: true },
            { titel: "Interesse", rechts: true },
            { titel: "Absage", rechts: true },
          ]}
          leer={a.kohorten.length ? null : "Noch keine Anschreiben."}
        >
          {[...a.kohorten].reverse().map((k) => (
            <tr key={k.monat}>
              <td className={zelle}>{monatLabel(k.monat, true)}</td>
              <td className={zelleRechts}>{formatInt(k.angeschrieben)}</td>
              <td className={zelleRechts}>{formatInt(k.reaktion)}</td>
              <td className={zelleRechts}>{q(k.reaktion, k.angeschrieben)}</td>
              <td className={zelleRechts}>{formatInt(k.interesse)}</td>
              <td className={zelleRechts}>{formatInt(k.absage)}</td>
            </tr>
          ))}
        </Tabelle>
      </Karte>

      <div className="grid gap-6 xl:grid-cols-3">
        <Karte titel="Absagegründe">
          <BalkenListe
            zeilen={a.absagegruende.map((g) => ({
              name: g.grund,
              wert: g.anzahl,
            }))}
            leer="Keine Absagen."
          />
        </Karte>
        <Karte titel="Nach Recherche-Welle">
          <BalkenListe
            zeilen={a.nachQuelle.map((x) => ({
              name: x.quelle,
              wert: x.angeschrieben,
              zusatz: `Reaktion ${q(x.reaktion, x.angeschrieben)}`,
            }))}
          />
        </Karte>
        <Karte titel="Nach Ort (Top 12)">
          <BalkenListe
            zeilen={a.nachOrt.map((x) => ({
              name: x.ort,
              wert: x.angeschrieben,
              zusatz: `Reaktion ${q(x.reaktion, x.angeschrieben)}`,
            }))}
          />
        </Karte>
      </div>

      <Karte
        titel={`Nachfassen: ${formatInt(daten.nachfassen.gesamt)} Briefe ohne Reaktion`}
        hinweis="Letzter Brief vor 3 Wochen bis 12 Monaten, keine Reaktion, danach weder Anruf noch E-Mail. Neueste zuerst."
      >
        <Tabelle
          kopf={[
            { titel: "Eigentümer" },
            { titel: "Adresse" },
            { titel: "Letzter Brief" },
            { titel: "Briefe", rechts: true },
            { titel: "Welle" },
          ]}
          leer={daten.nachfassen.liste.length ? null : "Alles nachgefasst."}
        >
          {daten.nachfassen.liste.map((n) => (
            <tr key={n.lead.id}>
              <td className={zelle}>
                <SfVerweis typ="Lead" id={n.lead.id}>
                  {n.name && n.name !== "[BUSINESS]"
                    ? n.name
                    : (n.firma ?? "Unbekannt")}
                </SfVerweis>
                {n.firma && n.name !== "[BUSINESS]" ? (
                  <div className="text-xs text-text-muted">{n.firma}</div>
                ) : null}
              </td>
              <td className={zelle}>
                {[n.strasse, n.ort].filter(Boolean).join(", ") || "–"}
              </td>
              <td className={zelle}>{datum(n.letzterBriefAm)}</td>
              <td className={zelleRechts}>{n.anzahlBriefe}</td>
              <td className={zelle}>{n.quelle ?? "–"}</td>
            </tr>
          ))}
        </Tabelle>
      </Karte>
    </div>
  );
}
