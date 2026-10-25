/**
 * Rechenkern der KI-Tools: Summen der Mieterliste, Kaufpreisstaffel, DCF und Zahlformate im Grenz-Stil.
 * Die KI liefert nur Eingangsdaten mit Beleg; gerechnet wird hier, deterministisch und testbar.
 */

import type { DcfDaten, Mieteinheit } from "./typen";

const de = (stellen: number) =>
  new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: stellen,
    maximumFractionDigits: stellen,
  });

export function zahl(n: number | null | undefined, stellen = 0): string {
  return n == null || !Number.isFinite(n) ? "" : de(stellen).format(n);
}

/** 2.560.000,00 € */
export function euro(n: number | null | undefined, stellen = 2): string {
  return n == null || !Number.isFinite(n) ? "" : `${de(stellen).format(n)} €`;
}

/** 2,2 Mio. € */
export function mio(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  const m = n / 1_000_000;
  const stellen = Math.abs(m - Math.round(m * 10) / 10) < 1e-9 ? 1 : 2;
  return `${de(stellen).format(m)} Mio. €`;
}

export function flaeche(n: number | null | undefined, ca = false): string {
  if (n == null || !Number.isFinite(n)) return "";
  const s = `${de(Number.isInteger(n) ? 0 : 2).format(n)} m²`;
  return ca ? `ca. ${s}` : s;
}

export function proM2(n: number | null | undefined): string {
  return n == null || !Number.isFinite(n) ? "" : `${de(2).format(n)} €/m²`;
}

export function fach(n: number | null | undefined): string {
  return n == null || !Number.isFinite(n) ? "" : `${de(1).format(n)} fach`;
}

export function prozent(n: number | null | undefined, stellen = 0): string {
  return n == null || !Number.isFinite(n)
    ? ""
    : `${de(stellen).format(n * 100)} %`;
}

export function datumLang(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("de-DE", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Berlin",
  }).format(d);
}

// ---------- Mieterliste ----------

export type MietSummen = {
  flaecheGesamt: number;
  flaecheWohnen: number;
  flaecheGewerbe: number;
  flaecheVermietet: number;
  wohneinheiten: number;
  gewerbeeinheiten: number;
  stellplaetze: number;
  mieteMonatIst: number;
  mieteMonatSoll: number;
  mieteWohnenIst: number;
  mieteGewerbeIst: number;
  /** Ø Miete je m² vermieteter Fläche */
  mieteM2Wohnen: number | null;
  mieteM2Gewerbe: number | null;
  /** Anteil vermieteter Fläche an der Gesamtfläche (0–1) */
  vermietungsstand: number | null;
};

export function mietSummen(einheiten: Mieteinheit[]): MietSummen {
  const s: MietSummen = {
    flaecheGesamt: 0,
    flaecheWohnen: 0,
    flaecheGewerbe: 0,
    flaecheVermietet: 0,
    wohneinheiten: 0,
    gewerbeeinheiten: 0,
    stellplaetze: 0,
    mieteMonatIst: 0,
    mieteMonatSoll: 0,
    mieteWohnenIst: 0,
    mieteGewerbeIst: 0,
    mieteM2Wohnen: null,
    mieteM2Gewerbe: null,
    vermietungsstand: null,
  };
  let wohnenVermietet = 0;
  let gewerbeVermietet = 0;
  for (const e of einheiten) {
    const f = e.flaeche ?? 0;
    const ist = e.belegung === "vermietet" ? (e.kaltmieteIst ?? 0) : 0;
    s.flaecheGesamt += f;
    if (e.belegung === "vermietet") s.flaecheVermietet += f;
    s.mieteMonatIst += ist;
    s.mieteMonatSoll += e.kaltmieteSoll ?? e.kaltmieteIst ?? 0;
    if (e.nutzung === "Wohnen") {
      s.wohneinheiten += 1;
      s.flaecheWohnen += f;
      s.mieteWohnenIst += ist;
      if (e.belegung === "vermietet") wohnenVermietet += f;
    } else if (e.nutzung === "Gewerbe") {
      s.gewerbeeinheiten += 1;
      s.flaecheGewerbe += f;
      s.mieteGewerbeIst += ist;
      if (e.belegung === "vermietet") gewerbeVermietet += f;
    } else if (
      e.nutzung === "Stellplatz" ||
      e.nutzung === "Garagenstellplatz"
    ) {
      s.stellplaetze += 1;
    }
  }
  s.mieteM2Wohnen =
    wohnenVermietet > 0 ? s.mieteWohnenIst / wohnenVermietet : null;
  s.mieteM2Gewerbe =
    gewerbeVermietet > 0 ? s.mieteGewerbeIst / gewerbeVermietet : null;
  s.vermietungsstand =
    s.flaecheGesamt > 0 ? s.flaecheVermietet / s.flaecheGesamt : null;
  return s;
}

// ---------- Kaufpreisstaffel ----------

/** Schrittweite der Staffel nach Größenordnung (wie im Grenz-Kaufpreistool: 25.000 bis 200.000 €). */
export function standardSchritt(preis: number): number {
  if (preis < 1_000_000) return 25_000;
  if (preis < 2_500_000) return 50_000;
  if (preis < 5_000_000) return 100_000;
  return 200_000;
}

/** Basis so, dass ein Zielpreis in der Mitte der 8-stufigen Staffel liegt. */
export function staffelBasis(zielpreis: number, schritt: number): number {
  return Math.max(
    schritt,
    Math.round(zielpreis / schritt) * schritt - 3 * schritt,
  );
}

export type StaffelZeile = {
  kaufpreis: number;
  preisM2: number | null;
  faktorIst: number | null;
  faktorSoll: number | null;
  faktorMarkt: number | null;
};

export function kaufpreisStaffel(p: {
  basis: number;
  schritt: number;
  flaeche: number;
  mieteJahrIst: number;
  mieteJahrSoll: number;
  mieteJahrMarkt: number;
}): StaffelZeile[] {
  const teil = (a: number, b: number) => (b > 0 ? a / b : null);
  return Array.from({ length: 8 }, (_, i) => {
    const kaufpreis = p.basis + i * p.schritt;
    return {
      kaufpreis,
      preisM2: teil(kaufpreis, p.flaeche),
      faktorIst: teil(kaufpreis, p.mieteJahrIst),
      faktorSoll: teil(kaufpreis, p.mieteJahrSoll),
      faktorMarkt: teil(kaufpreis, p.mieteJahrMarkt),
    };
  });
}

// ---------- DCF ----------

export const DCF_JAHRE = 10;

export type DcfStandard = Pick<
  DcfDaten,
  | "mietsteigerung"
  | "anpassungJahre"
  | "mietausfall"
  | "verwaltungProEinheit"
  | "instandhaltungM2"
  | "nichtUmlagefaehig"
  | "kostensteigerung"
  | "diskontierung"
  | "grunderwerbsteuer"
  | "notarGrundbuch"
  | "makler"
>;

/** Marktübliche Standardannahmen (NRW), jeweils als Annahme markiert und in der Oberfläche änderbar. */
export const DCF_STANDARD: Record<
  keyof DcfStandard,
  { wert: number; hinweis: string }
> = {
  mietsteigerung: {
    wert: 0.02,
    hinweis: "Standard: 2,0 % Mietsteigerung p. a. (Indexierung/Mietspiegel)",
  },
  anpassungJahre: {
    wert: 5,
    hinweis: "Standard: Anpassung an die Marktmiete über 5 Jahre (Fluktuation)",
  },
  mietausfall: {
    wert: 0.02,
    hinweis: "Standard: 2 % Mietausfallwagnis (Wohnen, II. BV)",
  },
  verwaltungProEinheit: {
    wert: 420,
    hinweis: "Standard: 420 € Verwaltung je Einheit p. a. (II. BV, 2026)",
  },
  instandhaltungM2: {
    wert: 14,
    hinweis: "Standard: 14 €/m² Instandhaltung p. a. (II. BV, Altbau)",
  },
  nichtUmlagefaehig: {
    wert: 0.01,
    hinweis: "Standard: 1 % sonstige nicht umlagefähige Kosten",
  },
  kostensteigerung: {
    wert: 0.02,
    hinweis: "Standard: 2,0 % Kostensteigerung p. a.",
  },
  diskontierung: {
    wert: 0.05,
    hinweis: "Standard: 5,0 % Diskontierungszins (Zielrendite)",
  },
  grunderwerbsteuer: { wert: 0.065, hinweis: "Grunderwerbsteuer NRW 6,5 %" },
  notarGrundbuch: {
    wert: 0.02,
    hinweis: "Standard: 2,0 % Notar und Grundbuch",
  },
  makler: {
    wert: 0.0595,
    hinweis: "Grenz-Käuferprovision 5,95 % inkl. USt. (bis 5 Mio. €)",
  },
};

export type DcfEingabe = {
  kaufpreis: number;
  flaeche: number;
  einheiten: number;
  mieteJahrIst: number;
  mieteJahrMarkt: number;
  anpassungJahre: number;
  mietsteigerung: number;
  mietausfall: number;
  verwaltungProEinheit: number;
  instandhaltungM2: number;
  nichtUmlagefaehig: number;
  kostensteigerung: number;
  diskontierung: number;
  exitFaktor: number;
  grunderwerbsteuer: number;
  notarGrundbuch: number;
  makler: number;
};

export type DcfJahr = {
  jahr: number;
  miete: number;
  mietausfall: number;
  verwaltung: number;
  instandhaltung: number;
  sonstige: number;
  noi: number;
  investitionExit: number;
  cashflow: number;
  diskontfaktor: number;
  barwert: number;
};

export type DcfErgebnis = {
  jahre: DcfJahr[];
  nebenkosten: number;
  gesamtinvestition: number;
  exitWert: number;
  barwert: number;
  kapitalwert: number;
  irr: number | null;
  faktorIst: number | null;
  preisM2: number | null;
  bruttoanfangsrendite: number | null;
  nettoanfangsrendite: number | null;
  /** Kaufpreis, bei dem der Kapitalwert 0 ist (Zielrendite = Diskontierungszins). */
  maxKaufpreis: number;
};

/** Miete im Jahr t: lineare Anpassung an die Marktmiete, dann Steigerung p. a. (wie die Excel-Formel). */
export function dcfMiete(e: DcfEingabe, t: number): number {
  const anteil =
    e.anpassungJahre <= 0
      ? 1
      : Math.min(t, e.anpassungJahre) / e.anpassungJahre;
  return (
    (e.mieteJahrIst + (e.mieteJahrMarkt - e.mieteJahrIst) * anteil) *
    (1 + e.mietsteigerung) ** (t - 1)
  );
}

export function irr(cashflows: number[]): number | null {
  const npv = (r: number) =>
    cashflows.reduce((s, c, t) => s + c / (1 + r) ** t, 0);
  let lo = -0.99;
  let hi = 1;
  let fLo = npv(lo);
  const fHi = npv(hi);
  if (fLo * fHi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const f = npv(mid);
    if (Math.abs(f) < 1e-7) return mid;
    if (f * fLo < 0) hi = mid;
    else {
      lo = mid;
      fLo = f;
    }
  }
  return (lo + hi) / 2;
}

export function dcfRechnen(e: DcfEingabe): DcfErgebnis {
  const nkQuote = e.grunderwerbsteuer + e.notarGrundbuch + e.makler;
  const nebenkosten = e.kaufpreis * nkQuote;
  const gesamtinvestition = e.kaufpreis + nebenkosten;
  const exitWert = dcfMiete(e, DCF_JAHRE + 1) * e.exitFaktor;
  const jahre: DcfJahr[] = [];
  for (let t = 0; t <= DCF_JAHRE; t++) {
    const kosten = (1 + e.kostensteigerung) ** (t - 1);
    const miete = t === 0 ? 0 : dcfMiete(e, t);
    const mietausfall = -miete * e.mietausfall;
    const verwaltung =
      t === 0 ? 0 : -e.einheiten * e.verwaltungProEinheit * kosten;
    const instandhaltung =
      t === 0 ? 0 : -e.flaeche * e.instandhaltungM2 * kosten;
    const sonstige = -miete * e.nichtUmlagefaehig;
    const noi = miete + mietausfall + verwaltung + instandhaltung + sonstige;
    const investitionExit =
      t === 0 ? -gesamtinvestition : t === DCF_JAHRE ? exitWert : 0;
    const cashflow = noi + investitionExit;
    const diskontfaktor = 1 / (1 + e.diskontierung) ** t;
    jahre.push({
      jahr: t,
      miete,
      mietausfall,
      verwaltung,
      instandhaltung,
      sonstige,
      noi,
      investitionExit,
      cashflow,
      diskontfaktor,
      barwert: t === 0 ? 0 : cashflow * diskontfaktor,
    });
  }
  const barwert = jahre.reduce((s, j) => s + j.barwert, 0);
  const teil = (a: number, b: number) => (b > 0 ? a / b : null);
  return {
    jahre,
    nebenkosten,
    gesamtinvestition,
    exitWert,
    barwert,
    kapitalwert: barwert - gesamtinvestition,
    irr: irr(jahre.map((j) => j.cashflow)),
    faktorIst: teil(e.kaufpreis, e.mieteJahrIst),
    preisM2: teil(e.kaufpreis, e.flaeche),
    bruttoanfangsrendite: teil(e.mieteJahrIst, e.kaufpreis),
    nettoanfangsrendite: teil(jahre[1].noi, gesamtinvestition),
    maxKaufpreis: barwert / (1 + nkQuote),
  };
}
