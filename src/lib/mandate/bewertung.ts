/**
 * Bewertung der Mandatsakte: Wertindikation aus Mandatsdaten (Salesforce), Grenz-Vergleichsdaten
 * (Exposé-Eingang, eigene Käufe, gewonnene Deals) und dem Angebotsmarkt des letzten Marktberichts.
 * Daraus entsteht die „Vermarktungseinschätzung“ in der Original-Vorlage von Grenz & Co.
 * Kein Gutachten. Reine Funktionen, laufen im Browser (sofortige Neuberechnung) und auf dem Server.
 */

import { fach, mio, zahl } from "@/lib/ki-tools/rechnen";
import type {
  EinschaetzungObjekt,
  MarktpreisDaten,
  Vergleichsobjekt,
} from "@/lib/ki-tools/typen";
import {
  bewerte,
  KEIN_GUTACHTEN,
  rundeSpanne,
  type BewertungsErgebnis,
  type Spanne,
  type VergleichMitAbstand,
} from "@/lib/ki-tools/vergleiche";
import type { Verteilung } from "@/lib/marktbericht/typen";

export const FORMAT_BEWERTUNG = "grenz-einschaetzung";

/** Objektdaten der Bewertung. Vorbelegt aus Salesforce, jedes Feld ist änderbar. */
export type BewertungsEingabe = {
  bezeichnung: string;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  objektart: string | null;
  baujahr: number | null;
  grundstueck: number | null;
  wohneinheiten: number | null;
  gewerbeeinheiten: number | null;
  flaecheWohnen: number | null;
  flaecheGewerbe: number | null;
  /** Gesamtmietfläche, falls Salesforce nur sie kennt. */
  flaecheGesamt: number | null;
  mieteJahrIst: number | null;
  mieteJahrSoll: number | null;
  besonderheiten: string[];
  lat: number | null;
  lng: number | null;
};

export type EingabeFeld = Exclude<
  keyof BewertungsEingabe,
  "besonderheiten" | "lat" | "lng"
>;

/** Woher ein Wert stammt: Salesforce-Feld oder Änderung in der App. */
export type Herkunft = Partial<Record<EingabeFeld, string>>;

export type BewertungsEinstellungen = {
  radiusKm: number;
  maxAlterMonate: number;
  /** Abschlag in % auf Angebotspreise (Forderungen), nur durch Nutzer gesetzt. */
  abschlagProzent: number | null;
  abschlagGesetztVon: string | null;
};

export const STANDARD_EINSTELLUNGEN: BewertungsEinstellungen = {
  radiusKm: 10,
  maxAlterMonate: 36,
  abschlagProzent: null,
  abschlagGesetztVon: null,
};

/** Angebotsmarkt des Teilmarkts aus dem jüngsten Marktbericht (Angebotsniveau). */
export type MarktReferenz = {
  berichtId: string;
  titel: string;
  stichtag: string;
  teilmarkt: string;
  faktor: Verteilung | null;
  preisM2: Verteilung | null;
  mieteM2: Verteilung | null;
  /** Geprüfte Werte großer Häuser, wörtlich mit Quelle. */
  benchmarks: {
    kennzahl: string;
    region: string;
    wert: number;
    einheit: string;
    quelle: string;
    stichtag: string;
  }[];
};

/** Entscheidung von Grenz & Co.: Preis, Empfänger und Texte der Einschätzung. */
export type BewertungsEntscheidung = {
  empfaenger: string;
  /** ISO-Datum der Einschätzung. */
  datum: string;
  /** null = Vorschlag der Wertindikation übernehmen. */
  preisGrenz: number | null;
  preisAnmerkung: string;
  preisEigentuemer: number | null;
  /** null = Standardtexte aus den Zahlen. */
  zusammenfassung: string[] | null;
  vorgehen: string[] | null;
};

export type MethodeId =
  | "faktor-kauf"
  | "faktor-angebot"
  | "qm-kauf"
  | "qm-angebot"
  | "markt-faktor"
  | "markt-qm";

export type Methode = {
  id: MethodeId;
  label: string;
  basis: "kauf" | "angebot";
  anzahl: number;
  einheit: "fach" | "€/m²";
  kennwert: Spanne;
  /** Wert nach einem gesetzten Abschlag (bei Angebotsbasis). */
  wert: Spanne;
  /** Kaufpreise zählen doppelt, Angebotspreise einfach. */
  gewicht: number;
  quelle: string;
};

export type Wertindikation = {
  methoden: Methode[];
  spanne: Spanne | null;
  /** Vorschlag Grenz & Co.: gewichteter Mittelwert, auf 50.000 € gerundet. */
  vorschlag: number | null;
  vergleiche: VergleichMitAbstand[];
  hinweise: string[];
};

export function flaecheVon(e: BewertungsEingabe): number | null {
  const summe = (e.flaecheWohnen ?? 0) + (e.flaecheGewerbe ?? 0);
  return summe > 0
    ? summe
    : e.flaecheGesamt && e.flaecheGesamt > 0
      ? e.flaecheGesamt
      : null;
}

function zahlOderNull(wert: unknown): number | null {
  if (wert === "" || wert == null) return null;
  const n = Number(wert);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function textOderNull(wert: unknown): string | null {
  return typeof wert === "string" && wert.trim() ? wert.trim() : null;
}

/** Vorbelegung aus sf_mandate und sf_real_estate, mit Herkunft je Feld. */
export function eingabeAusSalesforce(
  mandat: Record<string, unknown>,
  objekt: Record<string, unknown> | null,
): {
  eingabe: BewertungsEingabe;
  herkunft: Herkunft;
  /** Kaufpreisvorstellung des Eigentümers (Real Estate). */
  preisEigentuemer: number | null;
} {
  const o = objekt ?? {};
  const sf = (o.sf_daten ?? {}) as Record<string, unknown>;
  const herkunft: Herkunft = {};
  const merke = <T>(feld: EingabeFeld, wert: T | null, sfFeld: string) => {
    if (wert != null) herkunft[feld] = `Salesforce ${sfFeld}`;
    return wert;
  };
  const strasse = merke("strasse", textOderNull(o.strasse), "Street_Name__c");
  const eingabe: BewertungsEingabe = {
    bezeichnung:
      strasse ?? textOderNull(o.name) ?? String(mandat.name ?? "Liegenschaft"),
    strasse,
    plz: merke("plz", textOderNull(o.plz), "Postal_Code__c"),
    ort: merke("ort", textOderNull(o.ort), "City__c"),
    objektart: merke(
      "objektart",
      textOderNull(o.objektart),
      "Real_Estate_Type__c",
    ),
    baujahr: merke("baujahr", zahlOderNull(o.baujahr), "Construction_Year__c"),
    grundstueck: merke(
      "grundstueck",
      zahlOderNull(o.grundstuecksflaeche_m2),
      "Property_area__c",
    ),
    wohneinheiten: merke(
      "wohneinheiten",
      zahlOderNull(o.einheiten),
      "Anzahl_Wohnungen__c",
    ),
    // Salesforce führt weder Gewerbeeinheiten noch Soll-Miete: beides trägt der Nutzer ein.
    gewerbeeinheiten: null,
    flaecheWohnen: merke(
      "flaecheWohnen",
      zahlOderNull(o.wohnflaeche_m2),
      "Wohnfl_che__c",
    ),
    flaecheGewerbe: merke(
      "flaecheGewerbe",
      zahlOderNull(o.gewerbeflaeche_m2),
      "Gewerbefl_che__c",
    ),
    flaecheGesamt: merke(
      "flaecheGesamt",
      zahlOderNull(o.mietflaeche_m2),
      "Renable_Area__c",
    ),
    mieteJahrIst: merke(
      "mieteJahrIst",
      zahlOderNull(o.jahresnettokaltmiete),
      "Rental_income__c",
    ),
    mieteJahrSoll: null,
    besonderheiten: [],
    lat: typeof o.geo_lat === "number" ? o.geo_lat : null,
    lng: typeof o.geo_lng === "number" ? o.geo_lng : null,
  };
  return {
    eingabe,
    herkunft,
    preisEigentuemer: zahlOderNull(sf.Purchase_price_expectations__c),
  };
}

function gewichtetesMittel(liste: { w: number; g: number }[]): number {
  const summe = liste.reduce((s, x) => s + x.g, 0);
  return liste.reduce((s, x) => s + x.w * x.g, 0) / summe;
}

function mal(s: Spanne, f: number): Spanne {
  return { min: s.min * f, mittel: s.mittel * f, max: s.max * f };
}

function ausVerteilung(v: Verteilung): Spanne {
  return { min: v.p25, mittel: v.median, max: v.p75 };
}

/**
 * Wertindikation: Faktor- und Vergleichswertverfahren auf den Grenz-Vergleichsdaten
 * (ohne ausgeschlossene Objekte) plus Angebotsmarkt des Marktberichts. Kaufpreise wiegen doppelt;
 * ein Abschlag auf Angebotsniveau gilt nur, wenn ihn ein Nutzer gesetzt hat.
 */
export function wertindikation(
  eingabe: BewertungsEingabe,
  pool: VergleichMitAbstand[],
  ausgeschlossen: string[],
  markt: MarktReferenz | null,
  einstellungen: BewertungsEinstellungen,
  jetzt = new Date(),
): Wertindikation {
  const flaeche = flaecheVon(eingabe);
  const raus = new Set(ausgeschlossen);
  const erg: BewertungsErgebnis = bewerte(
    {
      bezeichnung: eingabe.bezeichnung,
      objektart: eingabe.objektart,
      flaeche,
      jahresmiete: eingabe.mieteJahrIst,
      baujahr: eingabe.baujahr,
      einheiten: eingabe.wohneinheiten,
      lat: eingabe.lat,
      lng: eingabe.lng,
    },
    pool.filter((v) => !raus.has(v.quelleId)),
    einstellungen,
    jetzt,
  );
  const abschlag =
    einstellungen.abschlagProzent && einstellungen.abschlagProzent > 0
      ? einstellungen.abschlagProzent
      : null;
  const methoden: Methode[] = erg.verfahren.map((v) => {
    const faktor = v.verfahren === "faktor";
    return {
      id: `${faktor ? "faktor" : "qm"}-${v.basis}` as MethodeId,
      label: `${faktor ? "Faktorverfahren" : "Vergleichswert je m²"} (${
        v.basis === "kauf" ? "Kaufpreise" : "Angebotspreise"
      })`,
      basis: v.basis,
      anzahl: v.anzahl,
      einheit: faktor ? "fach" : "€/m²",
      kennwert: v.kennwert,
      wert: v.wertNachAbschlag ?? v.wert,
      gewicht: v.basis === "kauf" ? 2 : 1,
      quelle: "Grenz-Vergleichsdaten",
    };
  });

  const hinweise = erg.hinweise.filter((h) => h !== KEIN_GUTACHTEN);
  if (markt) {
    const quelle = `${markt.titel}, Teilmarkt ${markt.teilmarkt}`;
    const nachAbschlag = (s: Spanne) =>
      abschlag ? mal(s, 1 - abschlag / 100) : s;
    if (markt.faktor && eingabe.mieteJahrIst)
      methoden.push({
        id: "markt-faktor",
        label: "Angebotsfaktor Marktbericht",
        basis: "angebot",
        anzahl: markt.faktor.n,
        einheit: "fach",
        kennwert: ausVerteilung(markt.faktor),
        wert: nachAbschlag(
          mal(ausVerteilung(markt.faktor), eingabe.mieteJahrIst),
        ),
        gewicht: 1,
        quelle,
      });
    if (markt.preisM2 && flaeche)
      methoden.push({
        id: "markt-qm",
        label: "Angebotspreis je m² Marktbericht",
        basis: "angebot",
        anzahl: markt.preisM2.n,
        einheit: "€/m²",
        kennwert: ausVerteilung(markt.preisM2),
        wert: nachAbschlag(mal(ausVerteilung(markt.preisM2), flaeche)),
        gewicht: 1,
        quelle,
      });
    if (!markt.faktor && !markt.preisM2)
      hinweise.push(
        `Im Marktbericht hat der Teilmarkt ${markt.teilmarkt} zu wenige Angebote für einen Wert.`,
      );
  } else
    hinweise.push(
      "Kein Marktbericht vorhanden: Marktumfeld nicht berücksichtigt.",
    );

  if (!methoden.length)
    return {
      methoden,
      spanne: null,
      vorschlag: null,
      vergleiche: erg.vergleiche,
      hinweise,
    };

  const spanne = rundeSpanne({
    min: gewichtetesMittel(
      methoden.map((m) => ({ w: m.wert.min, g: m.gewicht })),
    ),
    mittel: gewichtetesMittel(
      methoden.map((m) => ({ w: m.wert.mittel, g: m.gewicht })),
    ),
    max: gewichtetesMittel(
      methoden.map((m) => ({ w: m.wert.max, g: m.gewicht })),
    ),
  });
  if (!methoden.some((m) => m.basis === "kauf") && !abschlag)
    hinweise.push(
      "Nur Angebotspreise verfügbar: Die Spanne bildet Angebotsniveau ab. Ein Abschlag lässt sich in den Einstellungen setzen.",
    );
  return {
    methoden,
    spanne,
    vorschlag: Math.round(spanne.mittel / 50_000) * 50_000,
    vergleiche: erg.vergleiche,
    hinweise,
  };
}

/** Bis zu drei Vergleichsobjekte für die Folie: gewählte, sonst Kaufpreise vor Angeboten, nah vor fern. */
export function vergleicheFuerFolie(
  vergleiche: VergleichMitAbstand[],
  imPdf: string[] | null,
): VergleichMitAbstand[] {
  if (imPdf)
    return imPdf
      .map((id) => vergleiche.find((v) => v.quelleId === id))
      .filter((v): v is VergleichMitAbstand => Boolean(v))
      .slice(0, 3);
  return [...vergleiche]
    .sort((a, b) =>
      a.preisart === b.preisart
        ? (a.km ?? 99) - (b.km ?? 99)
        : a.preisart === "kauf"
          ? -1
          : 1,
    )
    .slice(0, 3);
}

export const QUELLE_TEXT: Record<string, string> = {
  salesforce_deal: "Grenz-Abschluss",
  expose: "Exposé-Eingang",
  postfach_expose: "Exposé-Eingang",
};

export function quelleText(quelle: string): string {
  return (
    QUELLE_TEXT[quelle] ??
    (/expose/i.test(quelle) ? "Exposé-Eingang" : "Grenz-Daten")
  );
}

/** Höchstens vier kurze Aussagen: mehr fasst das Textfeld der Preisfindung nicht. */
export function standardZusammenfassung(
  eingabe: BewertungsEingabe,
  ind: Wertindikation,
  markt: MarktReferenz | null,
  einstellungen: BewertungsEinstellungen,
): string[] {
  const zeilen: string[] = [];
  if (ind.spanne)
    zeilen.push(
      `Wertindikation ${mio(ind.spanne.min).replace(" Mio. €", "")} bis ${mio(ind.spanne.max)} aus ${ind.vergleiche.length} Vergleichsobjekten (Umkreis ${zahl(einstellungen.radiusKm)} km)`,
    );
  const kauf = ind.methoden.find((m) => m.id === "faktor-kauf");
  const angebot = ind.methoden.find((m) => m.id === "faktor-angebot");
  if (kauf)
    zeilen.push(
      `Verkaufte Vergleichsobjekte im Median bei ${fach(kauf.kennwert.mittel)} (${kauf.anzahl} Transaktionen)`,
    );
  else if (angebot)
    zeilen.push(
      `Angebotene Vergleichsobjekte im Median bei ${fach(angebot.kennwert.mittel)} (${angebot.anzahl} Angebote)`,
    );
  if (markt?.faktor)
    zeilen.push(
      `${markt.titel}: Angebotsfaktor ${markt.teilmarkt} ${fach(markt.faktor.median)}`,
    );
  if (
    eingabe.mieteJahrSoll &&
    eingabe.mieteJahrIst &&
    eingabe.mieteJahrSoll > eingabe.mieteJahrIst * 1.03
  )
    zeilen.push(
      `Mietsteigerungspotenzial rund ${zahl((eingabe.mieteJahrSoll / eingabe.mieteJahrIst - 1) * 100)} % bis zur Soll-Miete`,
    );
  zeilen.push("Preise erzielbar mit exklusiver Beauftragung und Bieterprozess");
  return zeilen.slice(0, 4);
}

export const STANDARD_VORGEHEN = [
  "Weiteres Vorgehen:",
  "Abschluss eines Maklervertrags und Aufbereitung sämtlicher Objektunterlagen",
  "Diskrete Ansprache passender Investoren aus der Grenz-Datenbank",
  "Besichtigungen, Einholung der Kaufangebote und Begleitung bis zur Beurkundung",
];

/** Daten für die Vorlage „Vermarktungseinschätzung“ (KI-Tool Marktpreisanalyse). */
export function einschaetzungDaten(
  eingabe: BewertungsEingabe,
  ind: Wertindikation,
  markt: MarktReferenz | null,
  einstellungen: BewertungsEinstellungen,
  entscheidung: BewertungsEntscheidung,
  imPdf: string[] | null,
): MarktpreisDaten {
  const nutzer = <T>(wert: T | null) => ({
    wert,
    beleg:
      wert == null
        ? null
        : { art: "nutzer" as const, hinweis: "Bewertung Mandatsakte" },
    geprueft: wert != null,
  });
  const rechnung = <T>(wert: T | null, hinweis: string) => ({
    wert,
    beleg: wert == null ? null : { art: "berechnung" as const, hinweis },
    geprueft: wert != null,
  });
  const nurWohnen = !eingabe.flaecheGewerbe && !eingabe.gewerbeeinheiten;
  const flaecheWohnen =
    eingabe.flaecheWohnen ?? (nurWohnen ? eingabe.flaecheGesamt : null);
  const objekt: EinschaetzungObjekt = {
    bezeichnung: eingabe.bezeichnung,
    objekt: {
      objektart: nutzer(eingabe.objektart),
      strasse: nutzer(eingabe.strasse),
      plz: nutzer(eingabe.plz),
      ort: nutzer(eingabe.ort),
      stadtteil: nutzer<string>(null),
    },
    grundstueck: nutzer(eingabe.grundstueck),
    wohneinheiten: nutzer(eingabe.wohneinheiten),
    gewerbeeinheiten: nutzer(
      eingabe.gewerbeeinheiten != null
        ? String(eingabe.gewerbeeinheiten)
        : null,
    ),
    flaecheWohnen: nutzer(flaecheWohnen),
    flaecheGewerbe: nutzer(eingabe.flaecheGewerbe),
    mieteJahrIst: nutzer(eingabe.mieteJahrIst),
    mieteJahrSoll: nutzer(eingabe.mieteJahrSoll),
    mieteM2Wohnen: rechnung(
      nurWohnen && eingabe.mieteJahrIst && flaecheWohnen
        ? Math.round((eingabe.mieteJahrIst / 12 / flaecheWohnen) * 100) / 100
        : null,
      "Jahresmiete / 12 / Wohnfläche",
    ),
    mieteM2Gewerbe: nutzer<number>(null),
    besonderheiten: eingabe.besonderheiten.filter((b) => b.trim()),
    preisGrenz: rechnung(
      entscheidung.preisGrenz ?? ind.vorschlag,
      "Wertindikation Mandatsakte",
    ),
    preisAnmerkung: entscheidung.preisAnmerkung,
    preisEigentuemer: nutzer(entscheidung.preisEigentuemer),
  };
  const vergleiche: Vergleichsobjekt[] = vergleicheFuerFolie(
    ind.vergleiche,
    imPdf,
  ).map((v) => ({
    adresse:
      [v.adresse, v.ort].filter(Boolean).join(", ") || quelleText(v.quelle),
    objektart: v.objektart ?? "",
    flaeche: v.flaeche,
    mieteJahr: v.jahresmiete,
    preis: v.kaufpreis,
    preisart: v.preisart,
    datum: v.stichtag,
    einordnung: [
      v.km != null ? `${zahl(v.km, 1)} km entfernt` : "",
      v.baujahr ? `Baujahr ${Math.round(v.baujahr)}` : "",
      v.stichtag
        ? `${v.preisart === "kauf" ? "Verkauft" : "Angeboten"} ${v.stichtag.slice(5, 7)}/${v.stichtag.slice(0, 4)}`
        : "",
    ].filter(Boolean),
    beleg: {
      art: "berechnung",
      hinweis: `Grenz-Vergleichsdaten: ${quelleText(v.quelle)}`,
    },
    geprueft: true,
  }));
  const faktor =
    ind.methoden.find((m) => m.id === "faktor-kauf") ??
    ind.methoden.find((m) => m.id === "faktor-angebot");
  const qm =
    ind.methoden.find((m) => m.id === "qm-kauf") ??
    ind.methoden.find((m) => m.id === "qm-angebot");
  return {
    empfaenger: entscheidung.empfaenger,
    datum: entscheidung.datum,
    untertitel: eingabe.objektart ?? "Liegenschaft",
    objekte: [objekt],
    vergleiche,
    zusammenfassung: (
      entscheidung.zusammenfassung ??
      standardZusammenfassung(eingabe, ind, markt, einstellungen)
    ).filter((z) => z.trim()),
    vorgehen: (entscheidung.vorgehen ?? STANDARD_VORGEHEN).filter((z) =>
      z.trim(),
    ),
    intern: {
      anzahl: ind.vergleiche.length,
      faktor: faktor?.kennwert ?? null,
      preisM2: qm?.kennwert ?? null,
    },
  };
}

export function bewertungDateiname(
  eingabe: BewertungsEingabe,
  version: number,
  endung: "pptx" | "pdf",
): string {
  const sauber = eingabe.bezeichnung
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_|_$/g, "");
  return `GrenzCo_Einschaetzung_${sauber || "Objekt"}_v${version}.${endung}`;
}
