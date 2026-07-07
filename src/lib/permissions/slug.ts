/** Erzeugt eine gültige Rollen-ID aus einer Bezeichnung. */
export function slugAusBezeichnung(bezeichnung: string): string {
  const basis = bezeichnung
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");

  if (!basis) return "";
  const mitPraefix = /^[a-z]/.test(basis) ? basis : `rolle-${basis}`;
  return mitPraefix.slice(0, 49);
}
