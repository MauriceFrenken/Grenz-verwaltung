/**
 * Kalkulationen der Aufteilerprojekte (Plan), übernommen aus Maurices
 * Excel-Kalkulationen vom 09.10.2026. Schlüssel ist die Objekt-ID.
 */

export type Szenario = "best" | "base" | "worst";

export interface PlanEinheit {
  label: string;
  flaeche: number;
  /** erwarteter Verkaufspreis je Szenario in € */
  preis: Record<Szenario, number>;
}

export interface AufteilerPlan {
  objektId: string;
  name: string;
  quelle: string;
  kosten: {
    /** Kaufpreis und Erwerbsnebenkosten */
    grundstueck: number;
    /** Baukosten inkl. Baunebenkosten und Reserve */
    bau: number;
    /** Zinsen und Finanzierungskosten; null = in der Excel nicht berechenbar */
    finanzierung: number | null;
    /** Beratung, Steuer, Marketing */
    sonstige: number;
  };
  eigenkapital: number | null;
  einheiten: PlanEinheit[];
  /** Hinweise zur Excel-Grundlage */
  hinweise: string[];
}

const preise = (
  flaeche: number,
  best: number,
  base: number,
  worst: number,
): Record<Szenario, number> => ({
  best: Math.round(flaeche * best * 100) / 100,
  base: Math.round(flaeche * base * 100) / 100,
  worst: Math.round(flaeche * worst * 100) / 100,
});

const apollinaris = (label: string, flaeche: number): PlanEinheit => ({
  label,
  flaeche,
  preis: preise(flaeche, 3200, 3000, 2800),
});

export const AUFTEILER_PLAENE: AufteilerPlan[] = [
  {
    objektId: "O-02",
    name: "Alt-Pempelfort 7",
    quelle: "Kalkulation Alt-Pempelfort 7 (Exec)",
    kosten: {
      grundstueck: 1_931_277,
      bau: 300_000,
      finanzierung: 58_876,
      sonstige: 35_000,
    },
    eigenkapital: null,
    einheiten: [
      {
        label: "Wohnen 1. OG",
        flaeche: 140,
        preis: { best: 698_750, base: 677_788, worst: 649_838 },
      },
      {
        label: "Wohnen 2. OG",
        flaeche: 134,
        preis: { best: 675_000, base: 650_000, worst: 625_000 },
      },
      {
        label: "Wohnen 3. OG",
        flaeche: 134,
        preis: { best: 850_202, base: 830_118, worst: 769_868 },
      },
      {
        label: "Wohnen 4. OG",
        flaeche: 97,
        preis: { best: 649_000, base: 646_600, worst: 636_000 },
      },
    ],
    hinweise: [
      "Die Gewinnzeilen je Wohnung ziehen 35.000 € mehr ab als die Gesamtinvestition (Base 444.353 € statt 479.353 €). Die Profit-Kennzahl 20,62 % passt zu 479.353 €.",
      "Verkaufspreise und €/m² passen nicht überall zusammen (z. B. 1. OG Best: 140 m² × 5.000 € = 700.000 €, eingetragen 698.750 €). Hier zählen die eingetragenen Preise.",
    ],
  },
  {
    objektId: "O-01",
    name: "Apollinarisstraße 18",
    quelle: "Kalkulation_Apollinarisstrasse-18.xlsx (Budget, Exec)",
    kosten: {
      // 1.200.000 € Kaufpreis + 6,5 % GrESt + 1,5 % Notar/Grundbuch
      grundstueck: 1_296_000,
      // 100 €/m² auf 634 m²; das Blatt Modernisierungskosten nennt 318.000 €
      bau: 63_417.4,
      finanzierung: null,
      // 3 % Projektentwicklung
      sonstige: 57_075.66,
    },
    eigenkapital: 250_000,
    einheiten: [
      apollinaris("EG links", 72.967),
      apollinaris("EG rechts", 46.544),
      apollinaris("1. OG links", 75.439),
      apollinaris("1. OG rechts", 57.144),
      apollinaris("2. OG links", 75.439),
      apollinaris("2. OG rechts", 57.144),
      apollinaris("3. OG links", 75.439),
      apollinaris("3. OG rechts", 57.144),
      apollinaris("DG links", 65.826),
      apollinaris("DG rechts", 51.088),
    ],
    hinweise: [
      "Die Finanzierungskosten und damit Gewinn und ROE zeigen in der Excel #NAME? (Formel aus einem Add-in). Gewinn hier vor Finanzierung.",
      "Baukosten: Das Budget rechnet mit 100 €/m² (63.417 €), das Blatt Modernisierungskosten nennt 318.000 €. Welcher Wert gilt?",
      "Der DCF nennt als Nutzen-Lasten-Übergang den 01.01.2024; bezahlt wurde der Kaufpreis am 01.09.2026.",
    ],
  },
];
