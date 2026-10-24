import type { DokumentInhalt } from "./typen";

/** Muster-Inhalt für die Vorschau der Design-Vorlage. */
export function musterInhalt(): DokumentInhalt {
  return {
    typ: "allgemein",
    titel: "Musterstraße 12, 50672 Köln",
    untertitel: "Vorschau der Grenz-Design-Vorlage",
    datum: new Date().toISOString(),
    stempel: "Muster",
    quellen: [
      { id: "q1", art: "feld", bezeichnung: "Salesforce Real Estate: Wohnfläche", verweis: "Real_Estate__c.Wohnfl_che__c" },
      { id: "q2", art: "dokument", bezeichnung: "Mieterliste 2026.xlsx", seite: 1, zitat: "Summe Nettokaltmiete p. a. 98.400 €" },
    ],
    abschnitte: [
      {
        id: "eckdaten",
        titel: "Eckdaten",
        bloecke: [
          {
            art: "kennzahlen",
            eintraege: [
              { label: "Wohnfläche", wert: "820 m²", quellen: ["q1"] },
              { label: "Jahresnettokaltmiete", wert: "98.400 €", quellen: ["q2"] },
              { label: "Kaufpreis", wert: "2.175.000 €" },
            ],
          },
        ],
      },
      {
        id: "objekt",
        titel: "Objekt",
        bloecke: [
          { art: "absatz", text: "Gepflegtes Mehrfamilienhaus mit zwölf Wohneinheiten in zentraler Lage.", quellen: ["q1"] },
          { art: "liste", punkte: ["Vollvermietet", "Baujahr 1962, 2015 modernisiert"] },
          { art: "luecke", text: "Energieausweis (Art, Kennwert, Energieträger, Baujahr Heizung) fehlt." },
          { art: "balken", eintraege: [{ label: "Angeschrieben", wert: 32 }, { label: "Geantwortet", wert: 8 }, { label: "Interesse", wert: 5 }] },
          { art: "tabelle", kopf: ["Einheit", "Fläche", "Miete"], zeilen: [["WE 1", "68 m²", "640 €"], ["WE 2", "72 m²", "690 €"]], ausrichtung: ["links", "rechts", "rechts"] },
          { art: "hinweis", text: "Indikative Einschätzung, kein Gutachten." },
        ],
      },
    ],
  };
}
