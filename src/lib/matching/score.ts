/**
 * Käufer-Matching (Masterplan 4.2): Ankaufsprofile aus Salesforce gegen ein Objekt bewerten.
 * Je Kriterium 0 bis 100 mit Begründung; Kriterien ohne Angabe im Profil oder Objekt zählen
 * nicht (neutral) und senken nur die Abdeckung. Reine Funktionen, testbar.
 */

export type ObjektMerkmale = {
  objektart: string | null;
  /** Ort, Stadtbezirk, Gemeinde, Kreis: alles, was in Suchregionen vorkommen kann. */
  orte: string[];
  preis: number | null;
  jahresmiete: number | null;
  einheiten: number | null;
  baujahr: number | null;
  /** Risikoklasse laut Makler (Core, Core+, Value Add, Opportunistic, Development), optional. */
  objektklasse: string | null;
};

export type ProfilZeile = {
  sf_id: string;
  name: string | null;
  kontakt_sf_id: string | null;
  account_sf_id: string | null;
  assetklassen: string[] | null;
  nutzungsarten: string[] | null;
  regionen: string[] | null;
  volumen_min: number | null;
  volumen_max: number | null;
  faktor_max: number | null;
  einheiten_min: number | null;
  baujahr_ab: number | null;
  baujahr_bis: number | null;
  investor_typ: string | null;
};

export type KriteriumId =
  | "nutzung"
  | "region"
  | "volumen"
  | "faktor"
  | "objektklasse"
  | "einheiten"
  | "baujahr";

export type Kriterium = {
  id: KriteriumId;
  label: string;
  gewicht: number;
  /** null = keine Angabe, zählt nicht. */
  punkte: number | null;
  begruendung: string;
};

export type MatchErgebnis = {
  profilSfId: string;
  score: number;
  /** Anteil der Gewichte mit Angaben (0 bis 100). */
  abdeckung: number;
  ausschluss: boolean;
  kriterien: Kriterium[];
};

export const GEWICHTE: Record<KriteriumId, number> = {
  nutzung: 25,
  region: 25,
  volumen: 25,
  faktor: 10,
  objektklasse: 5,
  einheiten: 5,
  baujahr: 5,
};

const LABEL: Record<KriteriumId, string> = {
  nutzung: "Nutzungsart",
  region: "Region",
  volumen: "Volumen",
  faktor: "Faktor",
  objektklasse: "Objektklasse",
  einheiten: "Einheiten",
  baujahr: "Baujahr",
};

function norm(s: string): string {
  return s
    .toLocaleLowerCase("de-DE")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function euro(n: number): string {
  return n >= 1_000_000
    ? `${(n / 1_000_000).toLocaleString("de-DE", { maximumFractionDigits: 2 })} Mio. €`
    : `${Math.round(n).toLocaleString("de-DE")} €`;
}

/** Objektart (Real_Estate_Type__c) auf Nutzungsarten der Ankaufsprofile abbilden: [voll passend, teilweise]. */
export function nutzungenFuerObjektart(objektart: string): {
  voll: string[];
  teil: string[];
} {
  const o = norm(objektart);
  if (/wohn ?und ?geschaeft|wgh|geschaeftshaus/.test(o))
    return { voll: ["wohn geschaeftshaus"], teil: ["wohnen", "einzelhandel"] };
  if (
    /mehrfamilien|mfh|wohnhaus|wohnanlage|eigentumswohnung|etw|apartment|wohnen/.test(
      o,
    )
  )
    return {
      voll: ["wohnen"],
      teil: ["wohn geschaeftshaus", "mirco apartments", "micro apartments"],
    };
  if (/buero|office|verwaltung/.test(o))
    return { voll: ["buero"], teil: ["behoerdenimmobilien"] };
  if (/einzelhandel|fachmarkt|retail|nahversorg|supermarkt/.test(o))
    return { voll: ["einzelhandel"], teil: [] };
  if (/grundstueck|bauland/.test(o)) return { voll: ["grundstueck"], teil: [] };
  if (/hotel/.test(o)) return { voll: ["hotel"], teil: [] };
  if (/logistik|lager|halle|gewerbe|industrie/.test(o))
    return { voll: ["logistik", "gewerbe", "light industrial"], teil: [] };
  if (/pflege|senior/.test(o))
    return { voll: ["pflege", "sozialimmobilien"], teil: [] };
  return { voll: [o], teil: [] };
}

function kriterium(
  id: KriteriumId,
  punkte: number | null,
  begruendung: string,
): Kriterium {
  return {
    id,
    label: LABEL[id],
    gewicht: GEWICHTE[id],
    punkte:
      punkte == null ? null : Math.round(Math.max(0, Math.min(100, punkte))),
    begruendung,
  };
}

export function bewerteProfil(
  objekt: ObjektMerkmale,
  p: ProfilZeile,
): MatchErgebnis {
  const kriterien: Kriterium[] = [];

  // Nutzungsart
  const nutzungen = (p.nutzungsarten ?? []).map(norm);
  if (!nutzungen.length)
    kriterien.push(kriterium("nutzung", null, "Profil ohne Nutzungsart."));
  else if (!objekt.objektart)
    kriterien.push(kriterium("nutzung", null, "Objektart nicht gepflegt."));
  else {
    const { voll, teil } = nutzungenFuerObjektart(objekt.objektart);
    const hat = (liste: string[]) =>
      liste.some((n) =>
        nutzungen.some((x) => x === n || x.includes(n) || n.includes(x)),
      );
    if (hat(voll))
      kriterien.push(
        kriterium(
          "nutzung",
          100,
          `Sucht ${p.nutzungsarten!.join(", ")}; passt zu ${objekt.objektart}.`,
        ),
      );
    else if (hat(teil))
      kriterien.push(
        kriterium(
          "nutzung",
          60,
          `Sucht ${p.nutzungsarten!.join(", ")}; teilweise passend zu ${objekt.objektart}.`,
        ),
      );
    else
      kriterien.push(
        kriterium(
          "nutzung",
          0,
          `Sucht ${p.nutzungsarten!.join(", ")}, nicht ${objekt.objektart}.`,
        ),
      );
  }

  // Region
  const regionen = (p.regionen ?? []).map((r) => ({ roh: r, n: norm(r) }));
  const orte = objekt.orte.map(norm).filter(Boolean);
  if (!regionen.length)
    kriterien.push(kriterium("region", null, "Profil ohne Suchregion."));
  else if (!orte.length)
    kriterien.push(
      kriterium("region", null, "Ort des Objekts nicht gepflegt."),
    );
  else {
    const treffer = regionen.find((r) =>
      orte.some(
        (o) =>
          r.n === o || r.n.split(" ").includes(o) || o.split(" ").includes(r.n),
      ),
    );
    const bundesweit = regionen.find((r) =>
      /deutschland|bundesweit|nordrhein westfalen|nrw/.test(r.n),
    );
    if (treffer)
      kriterien.push(
        kriterium(
          "region",
          100,
          `Suchregion ${treffer.roh} umfasst den Standort.`,
        ),
      );
    else if (bundesweit)
      kriterien.push(
        kriterium("region", 70, `Sucht großräumig (${bundesweit.roh}).`),
      );
    else
      kriterien.push(
        kriterium(
          "region",
          0,
          `Suchregionen ${regionen
            .slice(0, 4)
            .map((r) => r.roh)
            .join(", ")}${regionen.length > 4 ? " …" : ""} ohne den Standort.`,
        ),
      );
  }

  // Volumen
  const min = p.volumen_min && p.volumen_min > 0 ? p.volumen_min : null;
  const max = p.volumen_max && p.volumen_max > 0 ? p.volumen_max : null;
  if (!min && !max)
    kriterien.push(kriterium("volumen", null, "Profil ohne Volumen."));
  else if (!objekt.preis)
    kriterien.push(kriterium("volumen", null, "Angebotspreis nicht gepflegt."));
  else {
    const preis = objekt.preis;
    const spanne = `${min ? euro(min) : "offen"} bis ${max ? euro(max) : "offen"}`;
    if ((!min || preis >= min) && (!max || preis <= max))
      kriterien.push(
        kriterium("volumen", 100, `Preis ${euro(preis)} liegt in ${spanne}.`),
      );
    else {
      // bis 25 % außerhalb linear abfallend
      const abweichung =
        min && preis < min
          ? (min - preis) / min
          : max
            ? (preis - max) / max
            : 1;
      kriterien.push(
        kriterium(
          "volumen",
          100 - (abweichung / 0.25) * 100,
          `Preis ${euro(preis)} außerhalb ${spanne} (${Math.round(abweichung * 100)} % Abweichung).`,
        ),
      );
    }
  }

  // Faktor
  const faktor =
    objekt.preis && objekt.jahresmiete
      ? objekt.preis / objekt.jahresmiete
      : null;
  if (!p.faktor_max || p.faktor_max <= 0)
    kriterien.push(kriterium("faktor", null, "Profil ohne Höchstfaktor."));
  else if (!faktor)
    kriterien.push(
      kriterium(
        "faktor",
        null,
        "Faktor nicht berechenbar (Preis oder Miete fehlt).",
      ),
    );
  else {
    const f = faktor.toLocaleString("de-DE", { maximumFractionDigits: 1 });
    if (faktor <= p.faktor_max)
      kriterien.push(
        kriterium("faktor", 100, `Faktor ${f} bis höchstens ${p.faktor_max}.`),
      );
    else {
      const ueber = (faktor - p.faktor_max) / p.faktor_max;
      kriterien.push(
        kriterium(
          "faktor",
          100 - (ueber / 0.15) * 100,
          `Faktor ${f} über Höchstfaktor ${p.faktor_max}.`,
        ),
      );
    }
  }

  // Objektklasse (Risikoprofil)
  const klasseNorm = (x: string) => norm(x.replace(/\+/g, " plus "));
  const klassen = (p.assetklassen ?? []).map(klasseNorm);
  if (!klassen.length)
    kriterien.push(
      kriterium("objektklasse", null, "Profil ohne Objektklasse."),
    );
  else if (!objekt.objektklasse)
    kriterien.push(
      kriterium(
        "objektklasse",
        null,
        "Objektklasse des Objekts nicht gewählt.",
      ),
    );
  else {
    const k = klasseNorm(objekt.objektklasse);
    const passt = klassen.some(
      (x) =>
        x === k ||
        (x.startsWith(`${k} `) && !(k === "core" && x.startsWith("core plus"))),
    );
    kriterien.push(
      kriterium(
        "objektklasse",
        passt ? 100 : 0,
        `Sucht ${p.assetklassen!.join(", ")}.`,
      ),
    );
  }

  // Einheiten
  if (!p.einheiten_min)
    kriterien.push(
      kriterium("einheiten", null, "Profil ohne Mindestanzahl Einheiten."),
    );
  else if (!objekt.einheiten)
    kriterien.push(kriterium("einheiten", null, "Einheiten nicht gepflegt."));
  else
    kriterien.push(
      kriterium(
        "einheiten",
        objekt.einheiten >= p.einheiten_min ? 100 : 0,
        `${objekt.einheiten} Einheiten, mindestens ${p.einheiten_min}.`,
      ),
    );

  // Baujahr
  if (!p.baujahr_ab && !p.baujahr_bis)
    kriterien.push(kriterium("baujahr", null, "Profil ohne Baujahr."));
  else if (!objekt.baujahr)
    kriterien.push(kriterium("baujahr", null, "Baujahr nicht gepflegt."));
  else {
    const ok =
      (!p.baujahr_ab || objekt.baujahr >= p.baujahr_ab) &&
      (!p.baujahr_bis || objekt.baujahr <= p.baujahr_bis);
    kriterien.push(
      kriterium(
        "baujahr",
        ok ? 100 : 0,
        `Baujahr ${objekt.baujahr}, gesucht ${p.baujahr_ab ?? "offen"} bis ${p.baujahr_bis ?? "offen"}.`,
      ),
    );
  }

  const bewertet = kriterien.filter((k) => k.punkte != null);
  const gewichtBewertet = bewertet.reduce((s, k) => s + k.gewicht, 0);
  const gewichtGesamt = kriterien.reduce((s, k) => s + k.gewicht, 0);
  const score = gewichtBewertet
    ? bewertet.reduce((s, k) => s + k.punkte! * k.gewicht, 0) / gewichtBewertet
    : 0;
  // Harte Ausschlüsse: falsche Nutzungsart oder Region klar außerhalb.
  const ausschluss = kriterien.some(
    (k) => (k.id === "nutzung" || k.id === "region") && k.punkte === 0,
  );
  return {
    profilSfId: p.sf_id,
    score: Math.round(score),
    abdeckung: Math.round((gewichtBewertet / gewichtGesamt) * 100),
    ausschluss,
    kriterien,
  };
}

/** Sortiert: Ausschlüsse nach hinten, dann Score, dann Abdeckung. */
export function rangliste(
  objekt: ObjektMerkmale,
  profile: ProfilZeile[],
): MatchErgebnis[] {
  return profile
    .map((p) => bewerteProfil(objekt, p))
    .sort(
      (a, b) =>
        Number(a.ausschluss) - Number(b.ausschluss) ||
        b.score - a.score ||
        b.abdeckung - a.abdeckung,
    );
}
