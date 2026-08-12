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

  const mitPlzVorne = t.match(/^(\d{5})\s+(.+)$/);
  if (mitPlzVorne) {
    return {
      zip: mitPlzVorne[1],
      city: mitPlzVorne[2].replace(/,$/, "").trim(),
    };
  }

  const mitPlzHinten = t.match(/^(.+?)\s+(\d{5})$/);
  if (mitPlzHinten) {
    return {
      zip: mitPlzHinten[2],
      city: mitPlzHinten[1].replace(/,$/, "").trim(),
    };
  }

  if (/^\d{5}$/.test(t)) return { zip: t, city: "" };
  return { zip: "", city: t.replace(/,$/, "").trim() };
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
