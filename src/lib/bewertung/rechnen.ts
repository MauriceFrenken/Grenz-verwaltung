/**
 * Indikative Bewertung (Masterplan 4.4): Faktor- und Vergleichswertverfahren aus Vergleichsdaten.
 * Angebotspreise (Forderungen aus eingegangenen Exposés) und Kaufpreise werden getrennt geführt.
 * Ein Abschlag von Angebots- auf Kaufpreisniveau wird nur angewendet, wenn ein Nutzer ihn setzt.
 * Kein Gutachten. Reine Funktionen, testbar.
 */

export type Vergleich = {
  quelleId: string;
  quelle: string;
  preisart: "angebot" | "kauf";
  stichtag: string | null;
  adresse: string | null;
  plz: string | null;
  ort: string | null;
  objektart: string | null;
  baujahr: number | null;
  einheiten: number | null;
  flaeche: number | null;
  kaufpreis: number | null;
  jahresmiete: number | null;
  lat: number | null;
  lng: number | null;
};

export type BewertungsObjekt = {
  bezeichnung: string;
  objektart: string | null;
  flaeche: number | null;
  jahresmiete: number | null;
  baujahr: number | null;
  einheiten: number | null;
  lat: number | null;
  lng: number | null;
};

export type BewertungsParameter = {
  radiusKm: number;
  maxAlterMonate: number;
  /** Abschlag in % auf Angebotspreise, nur durch Nutzer gesetzt (null = kein Abschlag). */
  abschlagProzent: number | null;
  abschlagGesetztVon: string | null;
};

export const STANDARD_PARAMETER: BewertungsParameter = {
  radiusKm: 10,
  maxAlterMonate: 36,
  abschlagProzent: null,
  abschlagGesetztVon: null,
};

export type Spanne = { min: number; mittel: number; max: number };

export type VerfahrensErgebnis = {
  verfahren: "faktor" | "vergleich";
  basis: "kauf" | "angebot";
  anzahl: number;
  kennwert: Spanne;
  wert: Spanne;
  /** Wert nach Abschlag, nur bei Angebotsbasis mit gesetztem Abschlag. */
  wertNachAbschlag: Spanne | null;
  quellen: string[];
};

export type VergleichMitAbstand = Vergleich & {
  km: number | null;
  faktor: number | null;
  preisM2: number | null;
};

export type BewertungsErgebnis = {
  vergleiche: VergleichMitAbstand[];
  verfahren: VerfahrensErgebnis[];
  ergebnis: Spanne | null;
  hinweise: string[];
};

export const KEIN_GUTACHTEN =
  "Indikative Einschätzung auf Basis von Vergleichsdaten. Kein Verkehrswertgutachten im Sinne von § 194 BauGB und keine Bewertung nach ImmoWertV.";

export function kmZwischen(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const r = 6371;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

/** Grobe Nutzungsgruppe, damit nur Gleichartiges verglichen wird. */
export function nutzungsgruppe(objektart: string | null): string | null {
  if (!objektart) return null;
  const o = objektart.toLowerCase();
  if (/wohn.*gesch|wgh|geschäftshaus|geschaeftshaus/.test(o)) return "wgh";
  if (/mehrfamilien|mfh|wohnhaus|wohnanlage|wohnen|apartment|zinshaus/.test(o))
    return "wohnen";
  if (/büro|buero|office/.test(o)) return "buero";
  if (/handel|fachmarkt|retail|supermarkt/.test(o)) return "handel";
  if (/grundstück|grundstueck/.test(o)) return "grundstueck";
  return o.trim();
}

/** Quantil mit linearer Interpolation (p zwischen 0 und 1). */
export function quantil(werte: number[], p: number): number {
  const s = [...werte].sort((a, b) => a - b);
  if (!s.length) return NaN;
  const pos = (s.length - 1) * p;
  const u = Math.floor(pos);
  const o = Math.ceil(pos);
  return s[u] + (s[o] - s[u]) * (pos - u);
}

function spanneAus(werte: number[]): Spanne {
  return {
    min: quantil(werte, 0.25),
    mittel: quantil(werte, 0.5),
    max: quantil(werte, 0.75),
  };
}

function mal(s: Spanne, f: number): Spanne {
  return { min: s.min * f, mittel: s.mittel * f, max: s.max * f };
}

function monateZwischen(iso: string, jetzt: Date): number {
  const d = new Date(iso);
  return (jetzt.getTime() - d.getTime()) / (30.44 * 86_400_000);
}

const MIN_ANZAHL = 3;

export function bewerte(
  objekt: BewertungsObjekt,
  vergleichsdaten: Vergleich[],
  parameter: BewertungsParameter = STANDARD_PARAMETER,
  jetzt = new Date(),
): BewertungsErgebnis {
  const hinweise: string[] = [KEIN_GUTACHTEN];
  const gruppe = nutzungsgruppe(objekt.objektart);
  const geo =
    objekt.lat != null && objekt.lng != null
      ? { lat: objekt.lat, lng: objekt.lng }
      : null;
  if (!geo)
    hinweise.push(
      "Objekt ohne Koordinaten: Vergleichsobjekte nicht nach Entfernung gefiltert.",
    );
  if (!gruppe)
    hinweise.push("Objektart fehlt: Vergleich über alle Nutzungsarten.");

  const vergleiche: VergleichMitAbstand[] = vergleichsdaten
    .filter((v) => v.kaufpreis && v.kaufpreis > 0)
    .filter(
      (v) => !gruppe || !v.objektart || nutzungsgruppe(v.objektart) === gruppe,
    )
    .filter(
      (v) =>
        !v.stichtag ||
        monateZwischen(v.stichtag, jetzt) <= parameter.maxAlterMonate,
    )
    .map((v) => {
      const km =
        geo && v.lat != null && v.lng != null
          ? kmZwischen(geo, { lat: v.lat, lng: v.lng })
          : null;
      return {
        ...v,
        km: km == null ? null : Math.round(km * 10) / 10,
        faktor:
          v.jahresmiete && v.jahresmiete > 0
            ? Math.round((v.kaufpreis! / v.jahresmiete) * 100) / 100
            : null,
        preisM2:
          v.flaeche && v.flaeche > 0
            ? Math.round(v.kaufpreis! / v.flaeche)
            : null,
      };
    })
    .filter((v) => !geo || (v.km != null && v.km <= parameter.radiusKm))
    .sort((a, b) => (a.km ?? 9999) - (b.km ?? 9999))
    .slice(0, 30);

  const verfahren: VerfahrensErgebnis[] = [];
  const abschlag =
    parameter.abschlagProzent != null && parameter.abschlagProzent > 0
      ? parameter.abschlagProzent
      : null;

  const rechne = (
    art: "faktor" | "vergleich",
    bezug: number | null,
    kennwert: (v: VergleichMitAbstand) => number | null,
  ) => {
    if (!bezug || bezug <= 0) return;
    for (const basis of ["kauf", "angebot"] as const) {
      const passend = vergleiche.filter(
        (v) => v.preisart === basis && kennwert(v) != null,
      );
      if (passend.length < MIN_ANZAHL) continue;
      const k = spanneAus(passend.map((v) => kennwert(v)!));
      const wert = mal(k, bezug);
      verfahren.push({
        verfahren: art,
        basis,
        anzahl: passend.length,
        kennwert: k,
        wert,
        wertNachAbschlag:
          basis === "angebot" && abschlag
            ? mal(wert, 1 - abschlag / 100)
            : null,
        quellen: passend.map((v) => v.quelleId),
      });
    }
  };
  rechne("faktor", objekt.jahresmiete, (v) => v.faktor);
  rechne("vergleich", objekt.flaeche, (v) => v.preisM2);

  if (!objekt.jahresmiete)
    hinweise.push("Ist-Miete fehlt: Faktorverfahren nicht möglich.");
  if (!objekt.flaeche)
    hinweise.push("Fläche fehlt: Vergleichswertverfahren nicht möglich.");
  if (!verfahren.length)
    hinweise.push(
      `Weniger als ${MIN_ANZAHL} passende Vergleichsobjekte: keine Wertspanne.`,
    );
  if (verfahren.some((v) => v.basis === "angebot")) {
    hinweise.push(
      abschlag
        ? `Angebotspreise sind Forderungen. Abschlag von ${abschlag.toLocaleString("de-DE")} % gesetzt von ${parameter.abschlagGesetztVon ?? "Nutzer"}.`
        : "Angebotspreise sind Forderungen, keine Kaufpreise. Kein Abschlag gesetzt.",
    );
  }

  // Ergebnis: Kaufpreisbasis vor Angebotsbasis (nach Abschlag, sonst unverändert und als Angebotsniveau gekennzeichnet).
  const nutzbar = verfahren.map((v) => ({
    v,
    w: v.basis === "kauf" ? v.wert : (v.wertNachAbschlag ?? v.wert),
  }));
  const kauf = nutzbar.filter((x) => x.v.basis === "kauf");
  const auswahl = kauf.length ? kauf : nutzbar;
  const ergebnis = auswahl.length
    ? {
        min: Math.min(...auswahl.map((x) => x.w.min)),
        mittel: auswahl.reduce((s, x) => s + x.w.mittel, 0) / auswahl.length,
        max: Math.max(...auswahl.map((x) => x.w.max)),
      }
    : null;
  if (ergebnis && !kauf.length && !abschlag)
    hinweise.push("Die Spanne bildet Angebotsniveau ab.");

  return {
    vergleiche,
    verfahren,
    ergebnis: ergebnis && rundeSpanne(ergebnis),
    hinweise,
  };
}

/** Auf 10.000 € runden, damit keine Scheingenauigkeit entsteht. */
export function rundeSpanne(s: Spanne): Spanne {
  const r = (x: number) => Math.round(x / 10_000) * 10_000;
  return { min: r(s.min), mittel: r(s.mittel), max: r(s.max) };
}
