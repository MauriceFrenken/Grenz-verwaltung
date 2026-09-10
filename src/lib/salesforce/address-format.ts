/** Zerlegt „Straße Hausnummer“ (Ort nach Komma/Pipe wird ignoriert). */
export function splitStrasseHausnummer(adresse: string): {
  street: string;
  number: string;
} {
  const ohneOrt = adresse.split(/[|,]/)[0]?.trim() ?? adresse.trim();
  if (!ohneOrt) return { street: "", number: "" };

  const m = ohneOrt.match(
    /^(.+?)\s+(\d{1,4}(?:\s*[-–/]\s*\d{1,4})?[a-zA-Z]?)\s*$/,
  );
  if (m) {
    return {
      street: m[1].trim(),
      number: m[2].replace(/\s+/g, ""),
    };
  }
  return { street: ohneOrt, number: "" };
}

/** Zerlegt „40213 Düsseldorf“ / „Düsseldorf 40213“ / nur Stadt. */
export function parsePlzStadt(raw: string): { zip: string; city: string } {
  const t = raw.replace(/^D[E]?[-\s]/i, "").trim();
  if (!t) return { zip: "", city: "" };

  const bereinigeStadt = (city: string) =>
    city
      .replace(
        /\s+(Nähe|nahe|bei|neben|gegenüber|ca\.?|etwa|und|\/)\b.*$/i,
        "",
      )
      .replace(/,$/, "")
      .trim();

  const mitPlzVorne = t.match(/^(\d{5})\s+(.+)$/);
  if (mitPlzVorne) {
    return {
      zip: mitPlzVorne[1],
      city: bereinigeStadt(mitPlzVorne[2]),
    };
  }

  const mitPlzHinten = t.match(/^(.+?)\s+(\d{5})$/);
  if (mitPlzHinten) {
    return {
      zip: mitPlzHinten[2],
      city: bereinigeStadt(mitPlzHinten[1]),
    };
  }

  if (/^\d{5}$/.test(t)) return { zip: t, city: "" };
  return { zip: "", city: bereinigeStadt(t) };
}

export type AdressTeile = {
  street: string;
  number: string;
  city: string;
  zip: string;
};

/**
 * Liest Straße/Hausnr/Stadt/PLZ aus Exposé-Feldern.
 * Steht in der Adresse noch „, PLZ Stadt“, wird das als Fallback genutzt.
 */
export function resolveAdressTeile(felder: {
  objektadresse?: string | null;
  stadt?: string | null;
  plz?: string | null;
}): AdressTeile {
  const adresse = felder.objektadresse?.trim() ?? "";
  const { street, number } = splitStrasseHausnummer(adresse);
  const rest = adresse.split(/[|,]/).slice(1).join(",").trim();
  const parsed = parsePlzStadt(rest);

  return {
    street,
    number,
    city: felder.stadt?.trim() || parsed.city,
    zip: felder.plz?.trim() || parsed.zip,
  };
}

/**
 * Zieht PLZ/Stadt aus Freitext (Zitat, volle Adresszeile, Dateiname).
 * Deckt u. a. „Hauptstr. 12, 50667 Köln“ und „50667 Köln“.
 */
export function extrahierePlzStadtAusText(raw: string): {
  zip: string;
  city: string;
} {
  const t = raw.replace(/\s+/g, " ").trim();
  if (!t) return { zip: "", city: "" };

  // Nach Komma/Pipe oft der Ortsteil
  const nachTrenner = t.split(/[|,;]/).slice(1).join(" ").trim();
  if (nachTrenner) {
    const ausRest = parsePlzStadt(nachTrenner);
    if (ausRest.zip || ausRest.city) return ausRest;
  }

  // „… 50667 Köln“ / „… Köln 50667“ irgendwo im Text
  const plzVorne = t.match(
    /\b(\d{5})\s+([A-ZÄÖÜ][A-Za-zÄÖÜäöüß\-]*(?:\s+[A-ZÄÖÜ][A-Za-zÄÖÜäöüß\-]*){0,2})\b/,
  );
  if (plzVorne) {
    return {
      zip: plzVorne[1],
      city: plzVorne[2].replace(/,$/, "").trim(),
    };
  }
  const plzHinten = t.match(
    /\b([A-ZÄÖÜ][A-Za-zÄÖÜäöüß\-]*(?:\s+[A-ZÄÖÜ][A-Za-zÄÖÜäöüß\-]*){0,2})\s+(\d{5})\b/,
  );
  if (plzHinten) {
    return {
      zip: plzHinten[2],
      city: plzHinten[1].replace(/,$/, "").trim(),
    };
  }
  const nurPlz = t.match(/\b(\d{5})\b/);
  if (nurPlz) return { zip: nurPlz[1], city: "" };

  return { zip: "", city: "" };
}

/**
 * Vervollständigt Straße/Stadt/PLZ aus Feldern + optionalen Zusatzquellen
 * (z. B. KI-Zitate). Objektadresse wird auf Straße+Hausnummer bereinigt.
 */
export function anreichereAdressFelderWerte(
  felder: {
    objektadresse?: string | null;
    stadt?: string | null;
    plz?: string | null;
  },
  extraQuellen: Array<string | null | undefined> = [],
): { objektadresse: string; stadt: string; plz: string } {
  let teile = resolveAdressTeile(felder);

  for (const quelle of [
    felder.objektadresse,
    felder.stadt,
    felder.plz,
    ...extraQuellen,
  ]) {
    if (!quelle?.trim()) continue;
    if (!teile.street || !teile.number) {
      const ausAdresse = resolveAdressTeile({
        objektadresse: quelle,
        stadt: teile.city,
        plz: teile.zip,
      });
      if (!teile.street && ausAdresse.street) teile = { ...teile, street: ausAdresse.street };
      if (!teile.number && ausAdresse.number) teile = { ...teile, number: ausAdresse.number };
      if (!teile.city && ausAdresse.city) teile = { ...teile, city: ausAdresse.city };
      if (!teile.zip && ausAdresse.zip) teile = { ...teile, zip: ausAdresse.zip };
    }
    if (!teile.city || !teile.zip) {
      const ort = extrahierePlzStadtAusText(quelle);
      if (!teile.zip && ort.zip) teile = { ...teile, zip: ort.zip };
      if (!teile.city && ort.city) teile = { ...teile, city: ort.city };
    }
  }

  const objektadresse = [teile.street, teile.number].filter(Boolean).join(" ");
  return {
    objektadresse:
      objektadresse || (felder.objektadresse?.trim() ?? ""),
    stadt: teile.city || (felder.stadt?.trim() ?? ""),
    plz: teile.zip || (felder.plz?.trim() ?? ""),
  };
}

/** Salesforce-Name: „Straßenname Hausnr, Stadt“. */
export function formatObjektName(
  street?: string | null,
  number?: string | null,
  city?: string | null,
): string {
  const strasse = [street?.trim(), number?.trim()].filter(Boolean).join(" ");
  const stadt = city?.trim() ?? "";
  return [strasse, stadt].filter(Boolean).join(", ");
}

/** Detailadresse: „Straßenname Hausnr, PLZ Stadt“. */
export function formatDetailAdresse(
  street?: string | null,
  number?: string | null,
  zip?: string | null,
  city?: string | null,
): string {
  const strasse = [street?.trim(), number?.trim()].filter(Boolean).join(" ");
  const ort = [zip?.trim(), city?.trim()].filter(Boolean).join(" ");
  return [strasse, ort].filter(Boolean).join(", ");
}

export function formatObjektNameFromTeile(teile: AdressTeile): string {
  return formatObjektName(teile.street, teile.number, teile.city);
}

export function formatDetailAdresseFromTeile(teile: AdressTeile): string {
  return formatDetailAdresse(teile.street, teile.number, teile.zip, teile.city);
}
