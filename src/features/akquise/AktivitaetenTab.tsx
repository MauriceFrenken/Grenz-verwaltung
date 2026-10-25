import { BalkenListe, Karte, Tabelle } from "@/features/kennzahlen/bausteine";
import { zelle } from "@/features/kennzahlen/hilfen";
import { MASSNAHME_LABEL } from "@/lib/akquise/klassifizieren";
import type { AkquiseDto, Bereich } from "@/lib/akquise/typen";

import { datum } from "./hilfen";

const BEREICH_LABEL: Record<Bereich, string> = {
  akquise: "Akquise (Verkäufer)",
  vermarktung: "Vermarktung (Käufer)",
  allgemein: "Allgemein / Netzwerk",
};

/** Alle Aktivitäten: Verteilung nach Bereich und die letzten Einträge. */
export function AktivitaetenTab({ daten }: { daten: AkquiseDto }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <Karte titel="Aktivitäten nach Bereich (12 Monate)">
          <BalkenListe
            zeilen={daten.aktivitaeten.jeBereich.map((b) => ({
              name: BEREICH_LABEL[b.bereich],
              wert: b.anzahl,
            }))}
          />
        </Karte>
        <Karte titel="Aktivitäten nach Maßnahme (12 Monate)">
          <BalkenListe
            zeilen={[...daten.aktivitaeten.summen]
              .sort((a, b) => b.jahr - a.jahr)
              .filter((s) => s.jahr > 0)
              .map((s) => ({
                name: MASSNAHME_LABEL[s.massnahme],
                wert: s.jahr,
              }))}
          />
        </Karte>
      </div>
      <Karte
        titel="Letzte Aktivitäten"
        hinweis="Ohne Anschreiben (die stehen im Reiter Anschreiben)."
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
