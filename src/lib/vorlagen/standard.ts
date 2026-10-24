import type { AbschnittDefinition, DesignDefinition, DesignVorlage, DokumentTyp } from "./typen";

/**
 * Grenz-Standarddesign, abgeleitet aus der App (Navy, Gold, Garamond/Source Sans) und dem Impressum.
 * Disclaimer, Provisionshinweis und Widerrufsbelehrung sind Platzhalter, bis die Texte aus der
 * Exposé-Vorlage „2025-02-20_Vorlage_Expose“ übernommen sind.
 */
export const GRENZ_DESIGN: DesignDefinition = {
  farben: {
    primaer: "#1a2b4b",
    akzent: "#c4922a",
    text: "#1a2b4b",
    textHell: "#5a6a85",
    linie: "#e2e6ee",
    flaeche: "#f4f6f9",
  },
  schriften: { titel: "serif", text: "sans" },
  logoPfad: null,
  firma: {
    name: "Grenz & Co. Immobilienberatungs-GmbH",
    anschrift: "Friesenplatz 1, 50672 Köln",
    telefon: "+49 (0)221 669 648 50",
    email: "info@grenz-co.de",
    web: "grenz-co.de",
    register: "Amtsgericht Köln, HRB 121912, Geschäftsführer: Sebastian Grenz",
  },
  fusszeile: "Grenz & Co. Immobilienberatungs-GmbH · Friesenplatz 1 · 50672 Köln · grenz-co.de",
  disclaimer:
    "Alle Angaben beruhen auf Informationen des Eigentümers bzw. Dritter. Für Richtigkeit und Vollständigkeit wird keine Gewähr übernommen. Irrtum und Zwischenverkauf vorbehalten. [Text aus Grenz-Exposé-Vorlage übernehmen]",
  provisionshinweis: "[Provisionshinweis aus Grenz-Exposé-Vorlage übernehmen]",
  widerrufsbelehrung: "[Widerrufsbelehrung aus Grenz-Exposé-Vorlage übernehmen]",
  seitenformat: "A4",
};

export const STANDARD_ABSCHNITTE: Record<DokumentTyp, AbschnittDefinition[]> = {
  allgemein: [],
  expose: [
    { id: "eckdaten", titel: "Eckdaten", sichtbar: true },
    { id: "objekt", titel: "Objektbeschreibung", sichtbar: true },
    { id: "lage", titel: "Lage", sichtbar: true },
    { id: "flaechen", titel: "Flächen und Mieten", sichtbar: true },
    { id: "energie", titel: "Energieausweis", sichtbar: true },
    { id: "investment", titel: "Investment-Summary", sichtbar: true },
    { id: "provision", titel: "Provision", sichtbar: true },
    { id: "rechtliches", titel: "Hinweise", sichtbar: true },
  ],
  teaser: [
    { id: "eckdaten", titel: "Eckdaten", sichtbar: true },
    { id: "objekt", titel: "Objekt", sichtbar: true },
    { id: "investment", titel: "Investment-Summary", sichtbar: true },
    { id: "rechtliches", titel: "Hinweise", sichtbar: true },
  ],
  pitch: [],
  eigentuemer_report: [
    { id: "ueberblick", titel: "Überblick", sichtbar: true },
    { id: "funnel", titel: "Kampagnen-Funnel", sichtbar: true },
    { id: "aktivitaeten", titel: "Aktivitäten je Woche", sichtbar: true },
    { id: "angebote", titel: "Angebote", sichtbar: true },
    { id: "marktfeedback", titel: "Marktfeedback", sichtbar: true },
    { id: "naechste_schritte", titel: "Nächste Schritte", sichtbar: true },
  ],
  bewertung: [
    { id: "objekt", titel: "Objekt", sichtbar: true },
    { id: "ergebnis", titel: "Indikative Wertspanne", sichtbar: true },
    { id: "vergleich", titel: "Vergleichsobjekte", sichtbar: true },
    { id: "marktdaten", titel: "Marktdaten", sichtbar: true },
    { id: "hinweis", titel: "Hinweis", sichtbar: true },
  ],
};

export function standardVorlage(typ: DokumentTyp): DesignVorlage {
  return {
    id: null,
    name: "Grenz Standard",
    typ,
    design: GRENZ_DESIGN,
    abschnitte: STANDARD_ABSCHNITTE[typ],
    version: 1,
  };
}

/** Gespeicherte Teile über den Standard legen, damit neue Felder nie fehlen. */
export function vorlageZusammenfuehren(
  typ: DokumentTyp,
  gespeichert: { id?: string | null; name?: string; design?: unknown; abschnitte?: unknown; version?: number } | null,
  allgemein?: { design?: unknown } | null,
): DesignVorlage {
  const basis = standardVorlage(typ);
  const designQuelle = {
    ...((allgemein?.design as Partial<DesignDefinition>) ?? {}),
    ...((gespeichert?.design as Partial<DesignDefinition>) ?? {}),
  };
  const design: DesignDefinition = {
    ...basis.design,
    ...designQuelle,
    farben: { ...basis.design.farben, ...(designQuelle.farben ?? {}) },
    schriften: { ...basis.design.schriften, ...(designQuelle.schriften ?? {}) },
    firma: { ...basis.design.firma, ...(designQuelle.firma ?? {}) },
  };
  const gespeicherteAbschnitte = Array.isArray(gespeichert?.abschnitte)
    ? (gespeichert.abschnitte as AbschnittDefinition[])
    : [];
  // Reihenfolge und Sichtbarkeit aus der Vorlage, unbekannte Standardabschnitte hinten anhängen.
  const bekannt = new Set(gespeicherteAbschnitte.map((a) => a.id));
  const abschnitte = [
    ...gespeicherteAbschnitte.filter((a) => basis.abschnitte.some((b) => b.id === a.id)),
    ...basis.abschnitte.filter((b) => !bekannt.has(b.id)),
  ];
  return {
    id: gespeichert?.id ?? null,
    name: gespeichert?.name ?? basis.name,
    typ,
    design,
    abschnitte,
    version: gespeichert?.version ?? 1,
  };
}

/** Inhalt nach Vorlage ordnen und ausgeblendete Abschnitte entfernen. */
export function abschnitteNachVorlage<T extends { id: string; titel: string }>(
  abschnitte: T[],
  vorlage: DesignVorlage,
): T[] {
  if (!vorlage.abschnitte.length) return abschnitte;
  const ergebnis: T[] = [];
  for (const def of vorlage.abschnitte) {
    if (!def.sichtbar) continue;
    const a = abschnitte.find((x) => x.id === def.id);
    if (a) ergebnis.push({ ...a, titel: def.titel || a.titel });
  }
  for (const a of abschnitte) {
    if (!vorlage.abschnitte.some((d) => d.id === a.id)) ergebnis.push(a);
  }
  return ergebnis;
}
