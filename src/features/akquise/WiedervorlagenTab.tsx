import {
  Kachel,
  KachelReihe,
  Karte,
  Tabelle,
} from "@/features/kennzahlen/bausteine";
import { zelle } from "@/features/kennzahlen/hilfen";
import { MASSNAHME_LABEL } from "@/lib/akquise/klassifizieren";
import type { AkquiseDto } from "@/lib/akquise/typen";
import { formatInt } from "@/lib/format";
import { cn } from "@/lib/utils";

import { SfVerweis } from "./bausteine";
import { datum } from "./hilfen";

/** Offene Akquise-Aufgaben aus Salesforce (ohne vorbereitete Anschreiben). */
export function WiedervorlagenTab({ daten }: { daten: AkquiseDto }) {
  const w = daten.wiedervorlagen;
  return (
    <div className="flex flex-col gap-6">
      <KachelReihe>
        <Kachel titel="Offene Aufgaben" wert={formatInt(w.gesamt)} />
        <Kachel
          titel="Überfällig"
          wert={formatInt(w.ueberfaellig)}
          ton={w.ueberfaellig ? "schlecht" : undefined}
        />
        <Kachel
          titel="Briefe zum Nachfassen"
          wert={formatInt(daten.nachfassen.gesamt)}
          unterzeile="Liste im Reiter Anschreiben"
        />
      </KachelReihe>
      <Karte
        titel="Offene Wiedervorlagen"
        hinweis="Fällige zuerst. Erledigen in Salesforce, der Stand hier aktualisiert sich beim nächsten Laden."
      >
        <Tabelle
          kopf={[
            { titel: "Fällig" },
            { titel: "Maßnahme" },
            { titel: "Betreff" },
            { titel: "Mit" },
            { titel: "Von" },
          ]}
          leer={w.liste.length ? null : "Keine offenen Aufgaben."}
        >
          {w.liste.map((x) => (
            <tr key={x.id}>
              <td
                className={cn(zelle, x.ueberfaelligTage ? "text-danger" : "")}
              >
                {datum(x.faelligAm)}
                {x.ueberfaelligTage ? (
                  <span className="ml-1 text-xs">({x.ueberfaelligTage} T)</span>
                ) : null}
              </td>
              <td className={zelle}>{MASSNAHME_LABEL[x.massnahme]}</td>
              <td
                className="max-w-[24rem] truncate px-2 py-2"
                title={x.betreff}
              >
                {x.betreff}
              </td>
              <td className={zelle}>
                {x.sf ? (
                  <SfVerweis typ={x.sf.typ} id={x.sf.id}>
                    {x.wer ?? x.firma ?? "Datensatz"}
                  </SfVerweis>
                ) : (
                  (x.wer ?? "–")
                )}
              </td>
              <td className={zelle}>{x.bearbeiter ?? "–"}</td>
            </tr>
          ))}
        </Tabelle>
      </Karte>
    </div>
  );
}
