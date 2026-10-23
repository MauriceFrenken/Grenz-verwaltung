export type Zaehlung = { name: string; anzahl: number };

export type ExposeAnalyseDto = {
  anzahl: number;
  analysiert: number;
  /** Nach Salesforce übernommen. */
  exportiert: number;
  fehler: number;
  erstesDatum: string | null;
  letztesDatum: string | null;
  mitMiete: number;
  mitPreis: number;
  /** Summe Jahresnettokaltmiete aller angebotenen Objekte. */
  mieteGesamt: number;
  flaecheGesamt: number;
  medianMieteQm: number | null;
  medianPreisQm: number | null;
  /** Kaufpreis ÷ Jahresnettokaltmiete (nur Exposés mit beidem). */
  medianFaktor: number | null;
  /** Bruttoanfangsrendite in % aus dem Median-Faktor. */
  medianRendite: number | null;
  wochen: Array<{ woche: string; anzahl: number; exportiert: number }>;
  /** [Wochentag Mo..So][Stunde 0..23] Anzahl Eingänge (Europe/Berlin). */
  heatmap: number[][];
  objektarten: Zaehlung[];
  staedte: Array<{
    name: string;
    anzahl: number;
    miete: number;
    medianMieteQm: number | null;
    medianFaktor: number | null;
  }>;
  makler: Array<{
    name: string;
    anzahl: number;
    miete: number;
    medianFaktor: number | null;
    staedte: string[];
  }>;
  baujahre: Zaehlung[];
  energie: Zaehlung[];
  groessen: Zaehlung[];
  streuung: Array<{
    id: string;
    flaeche: number;
    mieteQm: number;
    miete: number;
    label: string;
  }>;
  objekte: Array<{
    id: string;
    eingegangenAm: string | null;
    adresse: string | null;
    stadt: string | null;
    objektart: string | null;
    makler: string | null;
    einheiten: number | null;
    flaeche: number | null;
    baujahr: number | null;
    miete: number | null;
    preis: number | null;
    faktor: number | null;
    mieteQm: number | null;
    exportiert: boolean;
  }>;
};
