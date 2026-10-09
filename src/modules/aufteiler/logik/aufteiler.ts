/**
 * Aufteilerprojekte: Plan aus der Kalkulation gegen Ist aus den Bankumsätzen
 * (reine Funktionen).
 */
import type { BoardDaten, Property } from "@/lib/db/typen";
import { runden } from "@/modules/darlehen/logik/zinsplan";
import {
  einordnen,
  type CfKategorie,
  type CfPosten,
} from "@/modules/cashflow/logik/einordnung";
import { AUFTEILER_PLAENE, type AufteilerPlan, type Szenario } from "./plaene";

export const SZENARIEN: Szenario[] = ["best", "base", "worst"];

export type KostenPosition = keyof AufteilerPlan["kosten"];

/** Welche Cashflow-Kategorien auf welche Kalkulationszeile zählen */
export const IST_ZUORDNUNG: Record<KostenPosition, CfKategorie[]> = {
  grundstueck: ["ankauf"],
  bau: ["sanierung", "instandhaltung"],
  finanzierung: ["zinsen"],
  sonstige: ["verwaltung"],
};

const LAUFEND: CfKategorie[] = [
  "versorger",
  "grundbesitz",
  "versicherung",
  "bank",
];

export interface AufteilerStand {
  plan: AufteilerPlan;
  property: Property | null;
  flaeche: number;
  investitionPlan: number;
  kostenJeQm: number;
  erloes: Record<Szenario, number>;
  /** Erlös minus Gesamtinvestition (ohne Finanzierung, wenn nicht bekannt) */
  gewinn: Record<Szenario, number>;
  marge: Record<Szenario, number>;
  ist: Record<KostenPosition, number> & {
    investition: number;
    verkauf: number;
    mieten: number;
    laufend: number;
  };
  /** Verkaufserlöse + Mieten − alle Ausgaben bisher */
  ergebnisBisher: number;
  datenAb: string | null;
  posten: CfPosten[];
}

export function aufteilerAuswerten(
  daten: Pick<
    BoardDaten,
    "companies" | "properties" | "bankAccounts" | "transactions"
  >,
  plaene: AufteilerPlan[] = AUFTEILER_PLAENE,
): AufteilerStand[] {
  const separat = new Set(
    daten.companies.filter((c) => c.separateArea).map((c) => c.id),
  );
  const accounts = daten.bankAccounts.filter((a) => !separat.has(a.companyId));
  const ibans = new Set(accounts.map((a) => a.iban));
  const posten = einordnen(
    daten.transactions.filter((t) => ibans.has(t.accountId)),
    { accounts, properties: daten.properties },
  );
  const datenAb = daten.transactions[0]?.bookingDate ?? null;

  return plaene.map((plan) => {
    const eigene = posten
      .filter((p) => p.objektId === plan.objektId)
      .sort((a, b) => b.datum.localeCompare(a.datum));
    const summe = (ks: CfKategorie[]) =>
      runden(
        eigene
          .filter((p) => ks.includes(p.kategorie))
          .reduce((s, p) => s + p.betrag, 0),
      );
    const flaeche = plan.einheiten.reduce((s, e) => s + e.flaeche, 0);
    const k = plan.kosten;
    const investitionPlan =
      k.grundstueck + k.bau + (k.finanzierung ?? 0) + k.sonstige;
    const erloes = {} as Record<Szenario, number>;
    const gewinn = {} as Record<Szenario, number>;
    const marge = {} as Record<Szenario, number>;
    for (const s of SZENARIEN) {
      erloes[s] = runden(plan.einheiten.reduce((a, e) => a + e.preis[s], 0));
      gewinn[s] = runden(erloes[s] - investitionPlan);
      marge[s] = investitionPlan ? gewinn[s] / investitionPlan : 0;
    }
    const ausgabe = (ks: CfKategorie[]) => -summe(ks);
    const ist = {
      grundstueck: ausgabe(IST_ZUORDNUNG.grundstueck),
      bau: ausgabe(IST_ZUORDNUNG.bau),
      finanzierung: ausgabe(IST_ZUORDNUNG.finanzierung),
      sonstige: ausgabe(IST_ZUORDNUNG.sonstige),
      investition: 0,
      verkauf: summe(["verkauf"]),
      mieten: summe(["miete", "sonstige_einnahmen"]),
      laufend: ausgabe(LAUFEND),
    };
    ist.investition = runden(
      ist.grundstueck + ist.bau + ist.finanzierung + ist.sonstige,
    );
    return {
      plan,
      property: daten.properties.find((p) => p.id === plan.objektId) ?? null,
      flaeche: runden(flaeche),
      investitionPlan: runden(investitionPlan),
      kostenJeQm: flaeche ? investitionPlan / flaeche : 0,
      erloes,
      gewinn,
      marge,
      ist,
      ergebnisBisher: runden(
        ist.verkauf + ist.mieten - ist.laufend - ist.investition,
      ),
      datenAb,
      posten: eigene,
    };
  });
}
