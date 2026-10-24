/** Bewertung als Dokument (PDF/PPTX) im Grenz-Design. */

import type { Block, DokumentInhalt, Quelle } from "@/lib/vorlagen/typen";

import {
  KEIN_GUTACHTEN,
  type BewertungsErgebnis,
  type BewertungsObjekt,
  type Spanne,
} from "./rechnen";

function euro(n: number): string {
  return `${Math.round(n).toLocaleString("de-DE")} €`;
}

function zahl(n: number, stellen = 1): string {
  return n.toLocaleString("de-DE", { maximumFractionDigits: stellen });
}

function spanneText(s: Spanne): string {
  return `${euro(s.min)} bis ${euro(s.max)} (Mittel ${euro(s.mittel)})`;
}

export function bewertungDokument(
  objekt: BewertungsObjekt & { adresse?: string | null },
  e: BewertungsErgebnis,
  optionen: { freigegeben: boolean; datum?: string },
): DokumentInhalt {
  const quellen: Quelle[] = e.vergleiche.map((v, i) => ({
    id: v.quelleId,
    art: "marktdaten",
    bezeichnung: `Vergleich ${i + 1}: ${v.preisart === "kauf" ? "Kaufpreis" : "Angebotspreis"} ${[v.adresse, v.ort].filter(Boolean).join(", ") || "ohne Adresse"}${v.stichtag ? `, ${v.stichtag.slice(0, 10)}` : ""}`,
    verweis: `${v.quelle}:${v.quelleId}`,
  }));

  const objektBloecke: Block[] = [
    {
      art: "kennzahlen",
      eintraege: [
        { label: "Objekt", wert: objekt.bezeichnung },
        { label: "Objektart", wert: objekt.objektart ?? "nicht gepflegt" },
        {
          label: "Fläche",
          wert: objekt.flaeche
            ? `${zahl(objekt.flaeche, 0)} m²`
            : "nicht gepflegt",
        },
        {
          label: "Ist-Miete p. a.",
          wert: objekt.jahresmiete
            ? euro(objekt.jahresmiete)
            : "nicht gepflegt",
        },
        {
          label: "Baujahr",
          wert: objekt.baujahr ? String(objekt.baujahr) : "nicht gepflegt",
        },
        {
          label: "Einheiten",
          wert: objekt.einheiten ? String(objekt.einheiten) : "nicht gepflegt",
        },
      ],
    },
  ];

  const ergebnisBloecke: Block[] = e.ergebnis
    ? [
        {
          art: "kennzahlen",
          eintraege: [
            { label: "Indikative Wertspanne von", wert: euro(e.ergebnis.min) },
            { label: "Mittel", wert: euro(e.ergebnis.mittel) },
            { label: "bis", wert: euro(e.ergebnis.max) },
          ],
        },
        {
          art: "tabelle",
          kopf: [
            "Verfahren",
            "Basis",
            "Anzahl",
            "Kennwert (25 %, 50 %, 75 %)",
            "Wert",
          ],
          ausrichtung: ["links", "links", "rechts", "rechts", "rechts"],
          zeilen: e.verfahren.map((v) => [
            v.verfahren === "faktor" ? "Faktor" : "Vergleichswert €/m²",
            v.basis === "kauf" ? "Kaufpreise" : "Angebotspreise",
            String(v.anzahl),
            `${zahl(v.kennwert.min)} / ${zahl(v.kennwert.mittel)} / ${zahl(v.kennwert.max)}`,
            spanneText(v.wertNachAbschlag ?? v.wert),
          ]),
        },
        {
          art: "absatz",
          text: "Berechnet aus den Vergleichsobjekten im Abschnitt Vergleichsobjekte.",
          quellen: e.vergleiche.map((v) => v.quelleId),
        },
      ]
    : [
        {
          art: "luecke",
          text: "Keine Wertspanne: zu wenig passende Vergleichsobjekte oder fehlende Miete/Fläche.",
        },
      ];

  const vergleichBloecke: Block[] = e.vergleiche.length
    ? [
        {
          art: "tabelle",
          kopf: ["Nr.", "Ort", "Art", "km", "Preis", "Faktor", "€/m²"],
          ausrichtung: [
            "rechts",
            "links",
            "links",
            "rechts",
            "rechts",
            "rechts",
            "rechts",
          ],
          zeilen: e.vergleiche.map((v, i) => [
            String(i + 1),
            [v.plz, v.ort].filter(Boolean).join(" ") || "k. A.",
            v.preisart === "kauf" ? "Kauf" : "Angebot",
            v.km == null ? "k. A." : zahl(v.km),
            v.kaufpreis ? euro(v.kaufpreis) : "k. A.",
            v.faktor ? zahl(v.faktor) : "k. A.",
            v.preisM2 ? zahl(v.preisM2, 0) : "k. A.",
          ]),
        },
      ]
    : [{ art: "luecke", text: "Keine Vergleichsobjekte im Umkreis." }];

  return {
    typ: "bewertung",
    titel: `Indikative Bewertung ${objekt.bezeichnung}`,
    untertitel: objekt.adresse ?? undefined,
    datum: optionen.datum ?? new Date().toISOString(),
    abschnitte: [
      { id: "objekt", titel: "Objekt", bloecke: objektBloecke },
      {
        id: "ergebnis",
        titel: "Indikative Wertspanne",
        bloecke: ergebnisBloecke,
      },
      {
        id: "vergleich",
        titel: "Vergleichsobjekte",
        bloecke: vergleichBloecke,
      },
      {
        id: "marktdaten",
        titel: "Marktdaten",
        bloecke: e.hinweise
          .filter((h) => h !== KEIN_GUTACHTEN)
          .map((h) => ({ art: "hinweis" as const, text: h })),
      },
      {
        id: "hinweis",
        titel: "Hinweis",
        bloecke: [{ art: "hinweis", text: KEIN_GUTACHTEN }],
      },
    ],
    quellen,
    stempel: optionen.freigegeben ? undefined : "ENTWURF",
  };
}
