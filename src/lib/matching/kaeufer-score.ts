/**
 * Scoring-Modell Käufer-Matching: ein nachvollziehbarer Score 0 bis 100 je Investor mit
 * Begründung je Baustein und Einteilung in A-, B- und C-Kreis.
 *
 * Baut auf der Passung je Kriterium aus score.ts auf (Objektart, Region, Volumen, Faktor,
 * Objektklasse, Einheiten, Baujahr) und ergänzt, was über das Ankaufsprofil hinaus zählt:
 * Aktivität der letzten 12 Monate, frühere Deals und Interesse bei Grenz, Kontaktqualität
 * sowie harte Ausschlüsse (DO_NOT_CONTACT, Absage auf dieses Mandat, falsche Nutzung oder
 * Region). Fehlende Angaben zählen mit 40 % der Punkte: unbekannt ist besser als unpassend,
 * aber schlechter als belegt. Reine Funktionen, testbar.
 */

import type { Kriterium, MatchErgebnis, ObjektMerkmale } from "./score";
import { nutzungsNaehe, regionsNaehe } from "./zusatz";

export type BausteinId =
  | "objektart"
  | "region"
  | "volumen"
  | "faktor"
  | "ankaufsprofil"
  | "aktivitaet"
  | "historie"
  | "kontakt";

/** Höchstpunkte je Baustein, Summe 100. */
export const PUNKTE: Record<BausteinId, number> = {
  objektart: 20,
  region: 20,
  volumen: 15,
  faktor: 5,
  ankaufsprofil: 10,
  aktivitaet: 10,
  historie: 12,
  kontakt: 8,
};

const LABEL: Record<BausteinId, string> = {
  objektart: "Objektart",
  region: "Region/Ort",
  volumen: "Volumen/Preisband",
  faktor: "Faktor/Rendite",
  ankaufsprofil: "Ankaufsprofil",
  aktivitaet: "Aktivität 12 Monate",
  historie: "Deals/Interesse",
  kontakt: "Kontaktqualität",
};

/** Anteil der Punkte, wenn eine Angabe fehlt. */
export const UNBEKANNT = 0.4;

/** Schwellen der Kreise. A setzt zusätzlich belegte Objektart und Region voraus. */
export const KREIS_A = 80;
export const KREIS_B = 65;
export const KREIS_C = 45;

export type Kreis = "A" | "B" | "C" | "unter" | "ausgeschlossen";

export type Baustein = {
  id: BausteinId;
  label: string;
  max: number;
  punkte: number;
  /** false = keine Angabe, mit 40 % angesetzt. */
  belegt: boolean;
  begruendung: string;
};

export type KaeuferScore = {
  score: number;
  kreis: Kreis;
  bausteine: Baustein[];
  /** Grund für den Ausschluss (Score 0), sonst null. */
  ausschluss: string | null;
  /** Abzüge und Deckel in Klartext, z. B. „kein Interesse: -15“. */
  hinweise: string[];
};

/** Was über den Investor bekannt ist, unabhängig vom Objekt. */
export type InvestorSignale = {
  /** Status laut Investorendatenbank: aktiv, ruhend, kein_interesse, gesperrt, erloschen. */
  status: string | null;
  doNotContact: boolean;
  aktivitaeten12m: number | null;
  letzterKontaktAm: string | null;
  letzteMarktaktivitaetAm: string | null;
  deals: number;
  dealsGewonnen: number;
  rueckmeldungen: number;
  /** Suchkunden-Liste: an wie vielen Grenz-Objekten Interesse bekundet wurde. */
  interesseObjekte: number;
  /** Bester Treffer bei ähnlichen Grenz-Mandaten (0 bis 100, historieTreffer), sonst null. */
  aehnlicheMandate: number | null;
  ansprechpartner: boolean;
  email: boolean;
  telefon: boolean;
  /** Freitext aus dem Ankaufsprofil (Bemerkungsfeld__c), dort stehen oft die Kriterien. */
  bemerkung: string | null;
  /** Status des Kontakts in einer Kampagne dieses Mandats (z. B. „Absage“), sonst null. */
  mandatStatus: string | null;
};

export const KEINE_SIGNALE: InvestorSignale = {
  status: null,
  doNotContact: false,
  aktivitaeten12m: null,
  letzterKontaktAm: null,
  letzteMarktaktivitaetAm: null,
  deals: 0,
  dealsGewonnen: 0,
  rueckmeldungen: 0,
  interesseObjekte: 0,
  aehnlicheMandate: null,
  ansprechpartner: false,
  email: false,
  telefon: false,
  bemerkung: null,
  mandatStatus: null,
};

function baustein(
  id: BausteinId,
  anteil: number | null,
  begruendung: string,
): Baustein {
  const max = PUNKTE[id];
  const a = anteil == null ? UNBEKANNT : Math.max(0, Math.min(1, anteil));
  return {
    id,
    label: LABEL[id],
    max,
    punkte: Math.round(a * max * 10) / 10,
    belegt: anteil != null,
    begruendung:
      anteil == null ? `${begruendung} (k. A., 40 % angesetzt)` : begruendung,
  };
}

function aus(match: MatchErgebnis, id: Kriterium["id"]) {
  return match.kriterien.find((k) => k.id === id);
}

function tageSeit(datum: string | null, heute: Date): number | null {
  if (!datum) return null;
  const t = new Date(datum).getTime();
  return Number.isFinite(t) ? (heute.getTime() - t) / 86_400_000 : null;
}

/** Bemerkung kürzen für die Begründung. */
function zitat(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > 70 ? `„${t.slice(0, 67)}…“` : `„${t}“`;
}

export function kaeuferScore(
  objekt: ObjektMerkmale,
  match: MatchErgebnis,
  s: InvestorSignale,
  heute = new Date(),
): KaeuferScore {
  const bausteine: Baustein[] = [];
  const bemerkung = s.bemerkung?.trim() || null;

  // Objektart: Profil, sonst Bemerkung (Kriterien stehen oft nur dort).
  const nutzung = aus(match, "nutzung");
  const bemerkungNutzung = bemerkung
    ? nutzungsNaehe(objekt.objektart, bemerkung)
    : null;
  if (nutzung?.punkte != null)
    bausteine.push(
      baustein("objektart", nutzung.punkte / 100, nutzung.begruendung),
    );
  else if (bemerkungNutzung)
    bausteine.push(
      baustein(
        "objektart",
        bemerkungNutzung === 1 ? 0.8 : 0.5,
        `Laut Bemerkung ${zitat(bemerkung!)} ${bemerkungNutzung === 1 ? "passend" : "teilweise passend"}.`,
      ),
    );
  else
    bausteine.push(
      baustein("objektart", null, nutzung?.begruendung ?? "Keine Angabe."),
    );

  // Region: Profil, sonst Bemerkung.
  const region = aus(match, "region");
  const bemerkungRegion = bemerkung
    ? regionsNaehe(objekt.orte, bemerkung)
    : null;
  if (region?.punkte != null)
    bausteine.push(baustein("region", region.punkte / 100, region.begruendung));
  else if (bemerkungRegion)
    bausteine.push(
      baustein(
        "region",
        bemerkungRegion >= 1 ? 0.8 : bemerkungRegion >= 0.6 ? 0.6 : 0.4,
        `Laut Bemerkung ${zitat(bemerkung!)} ${bemerkungRegion >= 1 ? "am Standort" : "in der Region"} aktiv.`,
      ),
    );
  else
    bausteine.push(
      baustein("region", null, region?.begruendung ?? "Keine Angabe."),
    );

  const volumen = aus(match, "volumen");
  bausteine.push(
    baustein(
      "volumen",
      volumen?.punkte != null ? volumen.punkte / 100 : null,
      volumen?.begruendung ?? "Keine Angabe.",
    ),
  );
  const faktor = aus(match, "faktor");
  bausteine.push(
    baustein(
      "faktor",
      faktor?.punkte != null ? faktor.punkte / 100 : null,
      faktor?.begruendung ?? "Keine Angabe.",
    ),
  );

  // Ankaufsprofil: Objektklasse, Einheiten, Baujahr; ohne diese die Bemerkung als Beleg.
  const details = (["objektklasse", "einheiten", "baujahr"] as const)
    .map((id) => aus(match, id))
    .filter((k): k is Kriterium => k?.punkte != null);
  if (details.length)
    bausteine.push(
      baustein(
        "ankaufsprofil",
        details.reduce((sum, k) => sum + k.punkte! * k.gewicht, 0) /
          details.reduce((sum, k) => sum + k.gewicht, 0) /
          100,
        details.map((k) => k.begruendung).join(" "),
      ),
    );
  else if (bemerkung && bemerkungNutzung === 1)
    bausteine.push(
      baustein(
        "ankaufsprofil",
        0.7,
        `Ankaufskriterien in der Bemerkung: ${zitat(bemerkung)}.`,
      ),
    );
  else
    bausteine.push(baustein("ankaufsprofil", null, "Keine Detailkriterien."));

  // Aktivität der letzten 12 Monate.
  const markt = tageSeit(s.letzteMarktaktivitaetAm, heute);
  const kontakt = tageSeit(s.letzterKontaktAm, heute);
  if (s.status === "aktiv" || (markt != null && markt <= 365))
    bausteine.push(
      baustein(
        "aktivitaet",
        1,
        markt != null && markt <= 365
          ? `Am Markt aktiv (zuletzt vor ${Math.round(markt)} Tagen laut Markt-Radar).`
          : "Status aktiv laut Investorendatenbank.",
      ),
    );
  else if ((s.aktivitaeten12m ?? 0) > 0)
    bausteine.push(
      baustein(
        "aktivitaet",
        (s.aktivitaeten12m ?? 0) >= 3 ? 0.8 : 0.6,
        `${s.aktivitaeten12m} Aktivitäten mit Grenz in 12 Monaten.`,
      ),
    );
  else if (kontakt != null && kontakt <= 365)
    bausteine.push(
      baustein(
        "aktivitaet",
        0.5,
        `Letzter Kontakt vor ${Math.round(kontakt)} Tagen.`,
      ),
    );
  else if (s.status === "ruhend" || s.aktivitaeten12m === 0)
    bausteine.push(
      baustein("aktivitaet", 0.1, "Keine Aktivität in den letzten 12 Monaten."),
    );
  else bausteine.push(baustein("aktivitaet", null, "Aktivität nicht bekannt."));

  // Frühere Deals und Interesse bei Grenz.
  const historie: [number, string][] = [];
  if (s.dealsGewonnen)
    historie.push([1, `${s.dealsGewonnen} gewonnene(r) Deal(s) mit Grenz.`]);
  if (s.deals)
    historie.push([0.85, `${s.deals} Interessenten-Deal(s) bei Grenz.`]);
  if (s.rueckmeldungen)
    historie.push([
      s.rueckmeldungen >= 2 ? 0.8 : 0.65,
      `${s.rueckmeldungen} Rückmeldung(en) auf Grenz-Kampagnen.`,
    ]);
  if (s.interesseObjekte)
    historie.push([
      s.interesseObjekte >= 3 ? 0.7 : 0.6,
      `Als Suchkunde an ${s.interesseObjekte} Grenz-Objekt(en) interessiert.`,
    ]);
  if (s.aehnlicheMandate != null && s.aehnlicheMandate >= 40)
    historie.push([
      s.aehnlicheMandate / 100,
      `Interesse an ähnlichen Grenz-Mandaten (Ähnlichkeit ${s.aehnlicheMandate}).`,
    ]);
  historie.sort((a, b) => b[0] - a[0]);
  bausteine.push(
    historie.length
      ? baustein(
          "historie",
          historie[0][0],
          historie.map(([, t]) => t).join(" "),
        )
      : baustein("historie", 0, "Noch keine Reaktion bei Grenz."),
  );

  // Kontaktqualität: Ansprechpartner 3, E-Mail 3, Telefon 2.
  const kq =
    (s.ansprechpartner ? 3 : 0) + (s.email ? 3 : 0) + (s.telefon ? 2 : 0);
  const fehlt = [
    s.ansprechpartner ? null : "Ansprechpartner",
    s.email ? null : "E-Mail",
    s.telefon ? null : "Telefon",
  ].filter(Boolean);
  bausteine.push(
    baustein(
      "kontakt",
      kq / 8,
      fehlt.length
        ? `Es fehlt: ${fehlt.join(", ")}.`
        : "Ansprechpartner mit E-Mail und Telefon.",
    ),
  );

  // Harte Ausschlüsse.
  let ausschluss: string | null = null;
  if (s.doNotContact || s.status === "gesperrt")
    ausschluss = "DO_NOT_CONTACT in Salesforce.";
  else if (s.status === "erloschen")
    ausschluss = "Firma erloschen oder insolvent.";
  else if (s.mandatStatus && /absage/i.test(s.mandatStatus))
    ausschluss = "Hat für dieses Objekt abgesagt.";
  else if (nutzung?.punkte === 0)
    ausschluss = `Falsche Nutzung: ${nutzung.begruendung}`;
  else if (region?.punkte === 0)
    ausschluss = `Region passt nicht: ${region.begruendung}`;

  const hinweise: string[] = [];
  let score = bausteine.reduce((sum, b) => sum + b.punkte, 0);
  let hoechstensB = false;
  let hoechstensC = false;
  // Absagen auf andere Objekte heißen nicht, dass dieses nicht passt: Abzug und höchstens B.
  if (s.status === "kein_interesse") {
    score -= 10;
    hoechstensB = true;
    hinweise.push(
      "Kein Interesse laut Investorendatenbank (Absagen): -10, höchstens B-Kreis.",
    );
  }
  if (volumen?.punkte === 0) {
    hoechstensC = true;
    hinweise.push("Preis klar außerhalb des Volumens: höchstens C-Kreis.");
  }
  score = ausschluss ? 0 : Math.max(0, Math.min(100, Math.round(score)));

  const kernBelegt = bausteine
    .filter((b) => b.id === "objektart" || b.id === "region")
    .every((b) => b.belegt);
  let kreis: Kreis;
  if (ausschluss) kreis = "ausgeschlossen";
  else if (score >= KREIS_A && kernBelegt && !hoechstensB && !hoechstensC)
    kreis = "A";
  else if (score >= KREIS_B && !hoechstensC) kreis = "B";
  else if (score >= KREIS_C) kreis = "C";
  else kreis = "unter";
  if (!ausschluss && score >= KREIS_A && !kernBelegt)
    hinweise.push("Objektart oder Region nicht belegt: höchstens B-Kreis.");

  return { score, kreis, bausteine, ausschluss, hinweise };
}

const KREIS_RANG: Record<Kreis, number> = {
  A: 0,
  B: 1,
  C: 2,
  unter: 3,
  ausgeschlossen: 4,
};

/** Sortierung: Kreis, dann Score. */
export function nachKreis<T extends { bewertung: KaeuferScore }>(
  a: T,
  b: T,
): number {
  return (
    KREIS_RANG[a.bewertung.kreis] - KREIS_RANG[b.bewertung.kreis] ||
    b.bewertung.score - a.bewertung.score
  );
}
