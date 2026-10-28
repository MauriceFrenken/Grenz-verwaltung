/**
 * Beauftragungsart eines Mandats (Mandate__c.Type_of_commissioning__c).
 * Nur ein schriftlicher Maklervertrag sichert die Provision; lose Beauftragungen
 * und Off-Market-Freigaben zählen in den Kennzahlen nur als Nebenwert.
 */

export const SCHRIFTLICHER_MAKLERVERTRAG = "Schriftlicher Maklervertrag";

export function hatSchriftlichenMaklervertrag(
  art: string | null | undefined,
): boolean {
  return (
    (art ?? "").trim().toLowerCase() ===
    SCHRIFTLICHER_MAKLERVERTRAG.toLowerCase()
  );
}

/** Kurzform für Tabellen und Karten. */
export function beauftragungsartKurz(art: string | null | undefined): string {
  if (!art) return "Art offen";
  if (hatSchriftlichenMaklervertrag(art)) return "Maklervertrag";
  if (/off-market/i.test(art)) return "Off-Market";
  if (/lose/i.test(art)) return "lose";
  return art;
}
