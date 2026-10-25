import { useMemo, useState } from "react";

import { BalkenListe, Karte, Tabelle } from "@/features/kennzahlen/bausteine";
import { zelle } from "@/features/kennzahlen/hilfen";
import { MASSNAHME_LABEL } from "@/lib/akquise/klassifizieren";
import { aktivitaetenSicht } from "@/lib/akquise/berechnen";
import type {
  AkquiseDto,
  AktivitaetenFilter,
  Bereich,
} from "@/lib/akquise/typen";

import { FilterLeiste } from "./bausteine";
import { datum } from "./hilfen";

const BEREICH_LABEL: Record<Bereich, string> = {
  akquise: "Akquise (Verkäufer)",
  vermarktung: "Vermarktung (Käufer)",
  allgemein: "Allgemein / Netzwerk",
};

/** Alle Aktivitäten: Verteilung nach Bereich und die letzten Einträge. */
export function AktivitaetenTab({ daten }: { daten: AkquiseDto }) {
  const [filter, setFilter] = useState<AktivitaetenFilter>({
    monate: 12,
    person: null,
    bereich: null,
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
  const zr = `${filter.monate} Monate`;
  return (
    <div className="flex flex-col gap-6">
      <FilterLeiste
        filter={filter}
        personen={sicht.personen}
        onChange={setFilter}
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <Karte
          titel={`Aktivitäten nach Bereich (${zr})`}
          hinweis="Ohne Bereichsfilter, damit der Vergleich sichtbar bleibt."
        >
          <BalkenListe
            zeilen={sicht.jeBereich.map((b) => ({
              name: BEREICH_LABEL[b.bereich],
              wert: b.anzahl,
            }))}
          />
        </Karte>
        <Karte titel={`Aktivitäten nach Maßnahme (${zr})`}>
          <BalkenListe
            zeilen={[...sicht.summen]
              .sort((a, b) => b.zeitraum - a.zeitraum)
              .filter((s) => s.zeitraum > 0)
              .map((s) => ({
                name: MASSNAHME_LABEL[s.massnahme],
                wert: s.zeitraum,
              }))}
          />
        </Karte>
      </div>
      <Karte
        titel="Letzte Aktivitäten"
        hinweis="Die letzten 80 erledigten Aktivitäten aller Bereiche, ohne Anschreiben (die stehen im Reiter Anschreiben)."
      >
        <Tabelle
          kopf={[
            { titel: "Datum" },
            { titel: "Maßnahme" },
            { titel: "Betreff" },
            { titel: "Mit" },
            { titel: "Von" },
          ]}
          leer={daten.aktivitaeten.letzte.length ? null : "Keine Aktivitäten."}
        >
          {daten.aktivitaeten.letzte.map((a) => (
            <tr key={a.id}>
              <td className={zelle}>{datum(a.datum)}</td>
              <td className={zelle}>{MASSNAHME_LABEL[a.massnahme]}</td>
              <td
                className="max-w-[28rem] truncate px-2 py-2"
                title={a.betreff}
              >
                {a.betreff}
              </td>
              <td className={zelle}>{a.wer ?? "–"}</td>
              <td className={zelle}>{a.bearbeiter ?? "–"}</td>
            </tr>
          ))}
        </Tabelle>
      </Karte>
    </div>
  );
}
