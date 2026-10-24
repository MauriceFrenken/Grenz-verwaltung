import type {
  AbschnittDefinition,
  DesignDefinition,
  DesignVorlage,
  DokumentTyp,
} from "./typen";

/**
 * Grenz-Standarddesign, abgeleitet aus der App (Navy, Gold, Garamond/Source Sans) und dem Impressum.
 * Disclaimer, Provisionshinweis und Widerrufsbelehrung wörtlich aus dem Grenz-Exposé
 * „Bilker Allee 112“ (Stand 04/2026, AGB Stand 03/2025) übernommen.
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
  fusszeile:
    "Grenz & Co. Immobilienberatungs-GmbH · Friesenplatz 1 · 50672 Köln · grenz-co.de",
  disclaimer:
    "Grenz & Co. hat dieses Exposé im Auftrag des Verkäufers erstellt. Es dient rein informatorischen Zwecken und soll dem Empfänger eine Übersicht über die wesentlichen Rahmendaten des Objekts geben. Das Exposé erhebt keinerlei Anspruch auf Vollständigkeit. Die zugrundeliegenden Informationen wurden Grenz & Co. vom Verkäufer und/oder von Dritten zur Verfügung gestellt. Die Vollständigkeit sowie die Richtigkeit dieser Informationen wurde von Grenz & Co. nicht überprüft; sie können jederzeit geändert bzw. aktualisiert werden. Eine Haftung von Grenz & Co. für direkte oder indirekte Schäden des Empfängers aufgrund von Fehlerhaftigkeiten oder Unvollständigkeiten der in diesem Exposé enthaltenen Informationen ist ausgeschlossen. Grenz & Co. und der Verkäufer sind nicht dazu verpflichtet, Kaufinteressenten weitere Informationen zur Verfügung zu stellen. Ein Anspruch auf Erwerb des Objekts oder auf die Durchführung von Verkaufsverhandlungen besteht nicht. Kaufinteressenten wird empfohlen, eine eigene Ankaufsprüfung und Analyse über das zum Verkauf stehende Objekt durchzuführen und in diesem Zusammenhang professionelle Berater hinzuzuziehen.",
  provisionshinweis:
    "Der guten Ordnung halber weisen wir darauf hin, dass bei Abschluss eines Kaufvertrages eine Provision an unser Unternehmen vom Käufer zu zahlen ist. Bei Grundstückskäufen errechnet sich die vom Käufer zu zahlende Provision aus dem erzielten Gesamtkaufpreis und allen damit in Verbindung stehenden Nebenleistungen wie folgt: von dem Wert bis 5 Mio. € 5 % (zzgl. USt.), von dem Wert über 5 Mio. € bis 15 Mio. € 4 % (zzgl. USt.), von dem Wert ab 15 Mio. € 3 % (zzgl. USt.). Ist eine der Kaufvertragsparteien eines Grundstücks Verbraucher, so erfolgt die Berechnung unserer Provision wie folgt: von dem Wert bis 5 Mio. € 5,95 % (inkl. MwSt.), von dem Wert über 5 Mio. € bis 15 Mio. € 4,76 % (inkl. MwSt.), von dem Wert ab 15 Mio. € 3,57 % (inkl. MwSt.). Im Übrigen gelten unsere beigefügten Allgemeinen Geschäftsbedingungen.",
  widerrufsbelehrung:
    "Widerrufsrecht: Das Widerrufsrecht gilt nur für Verbraucher. Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen. Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des Vertragsabschlusses. Um Ihr Widerrufsrecht auszuüben, müssen Sie uns (Grenz & Co. Immobilienberatungs-GmbH, Friesenplatz 1, 50672 Köln, Telefon: +49 221 669 648 50, E-Mail: info@grenz-co.de) mittels einer eindeutigen Erklärung (z. B. ein mit der Post versandter Brief oder E-Mail) über Ihren Entschluss, diesen Vertrag zu widerrufen, informieren. Sie können dafür das Muster-Widerrufsformular verwenden, das jedoch nicht vorgeschrieben ist. Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung über die Ausübung des Widerrufsrechts vor Ablauf der Widerrufsfrist absenden. Folgen des Widerrufs: Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die wir von Ihnen erhalten haben, unverzüglich und spätestens binnen vierzehn Tagen ab dem Tag zurückzuzahlen, an dem die Mitteilung über Ihren Widerruf dieses Vertrags bei uns eingegangen ist. Für diese Rückzahlung verwenden wir dasselbe Zahlungsmittel, das Sie bei der ursprünglichen Transaktion eingesetzt haben, es sei denn, mit Ihnen wurde ausdrücklich etwas anderes vereinbart; in keinem Fall werden Ihnen wegen dieser Rückzahlung Entgelte berechnet. Haben Sie verlangt, dass die Dienstleistungen während der Widerrufsfrist beginnen sollen, so haben Sie uns einen angemessenen Betrag zu zahlen, der dem Anteil der bis zu dem Zeitpunkt, zu dem Sie uns von der Ausübung des Widerrufsrechts hinsichtlich dieses Vertrags unterrichten, bereits erbrachten Dienstleistungen im Vergleich zum Gesamtumfang der im Vertrag vorgesehenen Dienstleistungen entspricht.",
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
    { id: "energie", titel: "Energieausweis", sichtbar: true },
    { id: "rechtliches", titel: "Hinweise", sichtbar: true },
  ],
  pitch: [],
  eigentuemer_report: [
    { id: "ueberblick", titel: "Überblick", sichtbar: true },
    { id: "funnel", titel: "Vermarktungsverlauf", sichtbar: true },
    { id: "aktivitaeten", titel: "Aktivitäten im Zeitraum", sichtbar: true },
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
  gespeichert: {
    id?: string | null;
    name?: string;
    design?: unknown;
    abschnitte?: unknown;
    version?: number;
  } | null,
  allgemein?: { design?: unknown } | null,
): DesignVorlage {
  const basis = standardVorlage(typ);
  const designQuelle: Partial<DesignDefinition> = {
    ...((allgemein?.design as Partial<DesignDefinition>) ?? {}),
    ...((gespeichert?.design as Partial<DesignDefinition>) ?? {}),
  };
  // Alte Platzhalter („[… übernehmen]“) aus gespeicherten Vorlagen durch die Grenz-Texte ersetzen.
  for (const k of [
    "disclaimer",
    "provisionshinweis",
    "widerrufsbelehrung",
  ] as const) {
    if (
      typeof designQuelle[k] === "string" &&
      /\[[^\]]*übernehmen\]/.test(designQuelle[k]!)
    )
      delete designQuelle[k];
  }
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
    ...gespeicherteAbschnitte.filter((a) =>
      basis.abschnitte.some((b) => b.id === a.id),
    ),
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
