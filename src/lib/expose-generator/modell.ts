/**
 * Exposé- und Teaser-Generator (Masterplan 4.1): Datenmodell, Vorbelegung aus Salesforce,
 * Pflichtangaben-Prüfung und Aufbau des Dokuments. Reine Funktionen, testbar.
 *
 * Jede Angabe trägt ihre Quelle (Salesforce-Feld, Unterlage mit Seite und Zitat, Eingabe eines
 * Nutzers). Angaben ohne Quelle gelten als Lücke. Die Freigabe ist gesperrt, solange die
 * Pflichtangaben-Prüfung Fehler meldet.
 */

import type { Block, DesignDefinition, DokumentInhalt, InhaltAbschnitt, Quelle } from "@/lib/vorlagen/typen";

export type ExposeTyp = "expose" | "teaser";

export const FELDER = [
  { id: "objektname", label: "Objektbezeichnung", gruppe: "eckdaten" },
  { id: "adresse", label: "Adresse", gruppe: "eckdaten" },
  { id: "lage_ort", label: "Ort / Stadtteil", gruppe: "eckdaten" },
  { id: "objektart", label: "Objektart", gruppe: "eckdaten" },
  { id: "baujahr", label: "Baujahr", gruppe: "eckdaten" },
  { id: "einheiten", label: "Einheiten", gruppe: "flaechen" },
  { id: "wohnflaeche", label: "Wohnfläche (m²)", gruppe: "flaechen" },
  { id: "gewerbeflaeche", label: "Gewerbefläche (m²)", gruppe: "flaechen" },
  { id: "grundstueck", label: "Grundstück (m²)", gruppe: "flaechen" },
  { id: "stellplaetze", label: "Stellplätze", gruppe: "flaechen" },
  { id: "ist_miete", label: "Ist-Nettokaltmiete p. a. (€)", gruppe: "flaechen" },
  { id: "soll_miete", label: "Soll-Nettokaltmiete p. a. (€)", gruppe: "flaechen" },
  { id: "kaufpreis", label: "Kaufpreis (€)", gruppe: "investment" },
  { id: "provision", label: "Käuferprovision", gruppe: "investment" },
  { id: "heizungsart", label: "Heizungsart", gruppe: "energie" },
  { id: "energieausweis_art", label: "Art des Energieausweises (Bedarf/Verbrauch)", gruppe: "energie" },
  { id: "energiekennwert", label: "Endenergiekennwert (kWh/(m²·a))", gruppe: "energie" },
  { id: "energietraeger", label: "Wesentlicher Energieträger", gruppe: "energie" },
  { id: "energieausweis_baujahr", label: "Baujahr laut Energieausweis", gruppe: "energie" },
  { id: "effizienzklasse", label: "Energieeffizienzklasse (Wohngebäude)", gruppe: "energie" },
] as const;

export type FeldId = (typeof FELDER)[number]["id"];

export const FELD_IDS = FELDER.map((f) => f.id) as FeldId[];

export function feldLabel(id: FeldId): string {
  return FELDER.find((f) => f.id === id)?.label ?? id;
}

export type FeldWert = { wert: string; quelle: Quelle | null };

export type Aussage = { text: string; quellen: string[] };

export type Unterlage = { id: string; name: string; seiten: number; text: string };

export type TextAbschnitt = "objekt" | "lage" | "investment";

export type ExposeInhalt = {
  felder: Partial<Record<FeldId, FeldWert>>;
  texte: Partial<Record<TextAbschnitt, Aussage[]>>;
  luecken: string[];
  /** Belege aus Unterlagen (Seite, Zitat), auf die Aussagen per Id verweisen. */
  belege: Quelle[];
  unterlagen: Unterlage[];
};

export function leererInhalt(): ExposeInhalt {
  return { felder: {}, texte: {}, luecken: [], belege: [], unterlagen: [] };
}

function zahlText(v: unknown, einheit = ""): string | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return null;
  return `${n.toLocaleString("de-DE", { maximumFractionDigits: 2 })}${einheit}`;
}

function sfQuelle(sfId: string, objekt: string, feld: string): Quelle {
  return { id: `sf:${sfId}:${feld}`, art: "feld", bezeichnung: `Salesforce ${objekt}, Feld ${feld}`, verweis: sfId };
}

/** Vorbelegung aus den Caches. Nur strukturierte Felder, keine internen Notizen. */
export function vorbelegungAusSalesforce(
  mandat: Record<string, unknown>,
  objekt: Record<string, unknown> | null,
): ExposeInhalt["felder"] {
  const f: ExposeInhalt["felder"] = {};
  const setze = (id: FeldId, wert: string | null, quelle: Quelle) => {
    if (wert && wert.trim()) f[id] = { wert: wert.trim(), quelle };
  };
  const mId = String(mandat.sf_id);
  setze(
    "provision",
    mandat.provision_prozent != null && Number(mandat.provision_prozent) > 0
      ? `${Number(mandat.provision_prozent).toLocaleString("de-DE")} % zzgl. gesetzlicher USt.`
      : null,
    sfQuelle(mId, "Mandat", "Commission_in__c"),
  );
  setze("kaufpreis", zahlText(mandat.angebotspreis), sfQuelle(mId, "Mandat", "Expose_preis__c"));
  if (objekt) {
    const oId = String(objekt.sf_id);
    const q = (feld: string) => sfQuelle(oId, "Objekt", feld);
    setze("objektname", (objekt.name as string) ?? null, q("Name"));
    const ortZeile = [objekt.plz, objekt.ort].filter(Boolean).join(" ");
    setze("adresse", [objekt.strasse, ortZeile].filter(Boolean).join(", ") || null, q("Street_Name__c"));
    const sfDaten = (objekt.sf_daten ?? {}) as Record<string, unknown>;
    setze("lage_ort", [objekt.ort, sfDaten.Stadtbezirk__c].filter(Boolean).join(", ") || null, q("City__c"));
    setze("objektart", (objekt.objektart as string) ?? null, q("Real_Estate_Type__c"));
    setze("baujahr", objekt.baujahr ? String(Math.round(Number(objekt.baujahr))) : null, q("Construction_Year__c"));
    setze("einheiten", zahlText(objekt.einheiten), q("Anzahl_Wohnungen__c"));
    setze("wohnflaeche", zahlText(objekt.wohnflaeche_m2), q("Wohnfl_che__c"));
    setze("gewerbeflaeche", zahlText(objekt.gewerbeflaeche_m2), q("Gewerbefl_che__c"));
    setze("grundstueck", zahlText(objekt.grundstuecksflaeche_m2), q("Property_area__c"));
    setze("stellplaetze", zahlText(sfDaten.Anzahl_Stellpl_tze__c), q("Anzahl_Stellpl_tze__c"));
    setze("ist_miete", zahlText(objekt.jahresnettokaltmiete), q("Rental_income__c"));
    setze("heizungsart", (objekt.heizungsart as string) ?? null, q("Type_of_heating__c"));
    setze("energieausweis_art", (objekt.energieausweis as string) ?? null, q("Energy_certificate__c"));
  }
  return f;
}

export function istWohngebaeude(objektart: string | undefined): boolean {
  return /wohn|mehrfamilien|mfh|wgh|apartment|eigentumswohnung/i.test(objektart ?? "");
}

/** Liegt zum Zeitpunkt der Anzeige kein Energieausweis vor, entfallen die Pflichtangaben (Hinweis im Dokument). */
export function energieausweisFehlt(art: string | undefined): boolean {
  return /liegt\s+(noch\s+)?nicht\s+vor|nicht\s+vorhanden|kein(er)?\s+energieausweis/i.test(art ?? "");
}

export const ENERGIEAUSWEIS_FEHLT_TEXT =
  "Zum Zeitpunkt der Erstellung des Exposés lag uns der Energieausweis nicht vor. Der Verkäufer ist verpflichtet, Kaufinteressenten den Energieausweis spätestens bei der Besichtigung vorzulegen und bei Abschluss des Kaufvertrages zu übergeben (§ 80 GEG).";

export type PruefPunkt = {
  id: string;
  label: string;
  status: "ok" | "fehlt" | "ohne_quelle";
  hinweis?: string;
};

export type Pruefung = { ok: boolean; punkte: PruefPunkt[]; geprueftAm: string };

/** Platzhalter aus der Standardvorlage, solange die Texte aus der Grenz-Vorlage fehlen. */
export function istPlatzhalter(text: string | undefined): boolean {
  return !text || !text.trim() || /^\[.*\]$/s.test(text.trim()) || /\[[^\]]*übernehmen\]/.test(text);
}

/**
 * Pflichtangaben vor der Freigabe:
 * GEG § 87 (Energieausweis-Angaben in Immobilienanzeigen), Provision, Preis, Flächen, Mieten,
 * rechtliche Hinweise aus der Design-Vorlage.
 */
export function pruefePflichtangaben(
  typ: ExposeTyp,
  inhalt: ExposeInhalt,
  design: Pick<DesignDefinition, "disclaimer" | "provisionshinweis" | "widerrufsbelehrung">,
  jetzt = new Date(),
): Pruefung {
  const f = inhalt.felder;
  const punkte: PruefPunkt[] = [];
  const feld = (id: FeldId, hinweis?: string) => {
    const w = f[id];
    punkte.push({
      id,
      label: feldLabel(id),
      status: !w?.wert?.trim() ? "fehlt" : !w.quelle ? "ohne_quelle" : "ok",
      hinweis,
    });
  };

  if (typ === "expose") feld("adresse");
  else feld("lage_ort");
  feld("objektart");
  feld("baujahr");
  feld("kaufpreis");
  feld("provision", "Pflicht für die Provisionsvereinbarung mit dem Käufer.");

  const wohn = f.wohnflaeche?.wert?.trim();
  const gewerbe = f.gewerbeflaeche?.wert?.trim();
  punkte.push({
    id: "flaechen",
    label: "Wohn- oder Gewerbefläche",
    status: !wohn && !gewerbe ? "fehlt" : (wohn && !f.wohnflaeche?.quelle) || (gewerbe && !f.gewerbeflaeche?.quelle) ? "ohne_quelle" : "ok",
  });
  feld("ist_miete", "Für Anlageobjekte: Ist-Miete laut Mieterliste.");

  const geg = "GEG § 87: Pflichtangabe in Immobilienanzeigen.";
  feld("energieausweis_art", `${geg} Liegt keiner vor: „liegt nicht vor“ eintragen.`);
  if (!energieausweisFehlt(f.energieausweis_art?.wert)) {
    feld("energiekennwert", geg);
    feld("energietraeger", geg);
    feld("energieausweis_baujahr", geg);
    if (istWohngebaeude(f.objektart?.wert)) feld("effizienzklasse", geg);
  }

  const texte: [string, string | undefined][] = [
    ["Haftungshinweis", design.disclaimer],
    ["Provisionshinweis", design.provisionshinweis],
  ];
  if (typ === "expose") texte.push(["Widerrufsbelehrung", design.widerrufsbelehrung]);
  for (const [label, t] of texte) {
    punkte.push({
      id: `text:${label}`,
      label,
      status: istPlatzhalter(t) ? "fehlt" : "ok",
      hinweis: istPlatzhalter(t) ? "In Einstellungen › Design-Vorlagen den Text aus der Grenz-Exposé-Vorlage hinterlegen." : undefined,
    });
  }

  // Aussagen in den Texten ohne Beleg sperren ebenfalls.
  const ohneBeleg = Object.values(inhalt.texte)
    .flat()
    .filter((a) => a && a.text.trim() && !a.quellen.length).length;
  punkte.push({
    id: "texte",
    label: "Texte mit Belegen",
    status: ohneBeleg ? "ohne_quelle" : "ok",
    hinweis: ohneBeleg ? `${ohneBeleg} Aussage(n) ohne Beleg.` : undefined,
  });

  return { ok: punkte.every((p) => p.status === "ok"), punkte, geprueftAm: jetzt.toISOString() };
}

/** Löst Beleg-Ids einer Aussage auf: „feld:<id>“ verweist auf die Quelle des Feldes. */
export function quelleFuer(id: string, inhalt: ExposeInhalt): Quelle | null {
  if (id.startsWith("feld:")) {
    const w = inhalt.felder[id.slice(5) as FeldId];
    return w?.quelle ?? null;
  }
  return inhalt.belege.find((b) => b.id === id) ?? null;
}

function euroText(wert: string | undefined): string | null {
  if (!wert) return null;
  return /€|eur/i.test(wert) ? wert : `${wert} €`;
}

/** Baut das Dokument. Fehlende Angaben werden als Lücke sichtbar, nie erfunden. */
export function exposeDokument(
  typ: ExposeTyp,
  inhalt: ExposeInhalt,
  design: Pick<DesignDefinition, "disclaimer" | "provisionshinweis" | "widerrufsbelehrung">,
  optionen: { titel: string; freigegeben: boolean; datum?: string },
): DokumentInhalt {
  const quellen: Quelle[] = [];
  const nimm = (q: Quelle | null): string[] => {
    if (!q) return [];
    if (!quellen.some((x) => x.id === q.id)) quellen.push(q);
    return [q.id];
  };
  const f = inhalt.felder;
  const kennzahl = (id: FeldId, label = feldLabel(id).replace(/ \(.*\)$/, ""), format?: (w: string) => string | null) => {
    const w = f[id];
    if (!w?.wert) return null;
    return { label, wert: format ? (format(w.wert) ?? w.wert) : w.wert, quellen: nimm(w.quelle) };
  };
  const m2 = (w: string) => (/m²/.test(w) ? w : `${w} m²`);
  const liste = <T,>(xs: (T | null)[]) => xs.filter((x): x is T => x != null);

  const abschnitte: InhaltAbschnitt[] = [];
  const luecke = (id: FeldId): Block | null => (f[id]?.wert ? null : { art: "luecke", text: feldLabel(id) });

  abschnitte.push({
    id: "eckdaten",
    titel: "Eckdaten",
    bloecke: [
      {
        art: "kennzahlen",
        eintraege: liste([
          typ === "expose" ? kennzahl("adresse") : kennzahl("lage_ort", "Lage"),
          kennzahl("objektart"),
          kennzahl("baujahr"),
          kennzahl("einheiten"),
          kennzahl("kaufpreis", "Kaufpreis", euroText),
          kennzahl("ist_miete", "Ist-Miete p. a.", euroText),
        ]),
      },
      ...liste([luecke("kaufpreis"), luecke("objektart")]),
    ],
  });

  const aussagenBloecke = (abschnitt: TextAbschnitt): Block[] => {
    const bloecke: Block[] = [];
    for (const a of inhalt.texte[abschnitt] ?? []) {
      if (!a.text.trim()) continue;
      const ids = a.quellen.flatMap((id) => nimm(quelleFuer(id, inhalt)));
      bloecke.push(ids.length ? { art: "absatz", text: a.text, quellen: ids } : { art: "luecke", text: `Ohne Beleg: ${a.text}` });
    }
    return bloecke;
  };

  const objektTexte = aussagenBloecke("objekt");
  abschnitte.push({
    id: "objekt",
    titel: typ === "teaser" ? "Objekt" : "Objektbeschreibung",
    bloecke: objektTexte.length ? objektTexte : [{ art: "luecke", text: "Objektbeschreibung noch nicht erfasst." }],
  });

  if (typ === "expose") {
    const lage = aussagenBloecke("lage");
    abschnitte.push({ id: "lage", titel: "Lage", bloecke: lage.length ? lage : [{ art: "luecke", text: "Lagebeschreibung noch nicht erfasst." }] });

    abschnitte.push({
      id: "flaechen",
      titel: "Flächen und Mieten",
      bloecke: [
        {
          art: "kennzahlen",
          eintraege: liste([
            kennzahl("wohnflaeche", "Wohnfläche", m2),
            kennzahl("gewerbeflaeche", "Gewerbefläche", m2),
            kennzahl("grundstueck", "Grundstück", m2),
            kennzahl("stellplaetze"),
            kennzahl("ist_miete", "Ist-Nettokaltmiete p. a.", euroText),
            kennzahl("soll_miete", "Soll-Nettokaltmiete p. a.", euroText),
          ]),
        },
        ...liste([luecke("ist_miete")]),
      ],
    });

    const energie = liste([
      kennzahl("energieausweis_art", "Energieausweis"),
      kennzahl("energiekennwert", "Endenergiekennwert", (w) => (/kwh/i.test(w) ? w : `${w} kWh/(m²·a)`)),
      kennzahl("energietraeger", "Energieträger"),
      kennzahl("energieausweis_baujahr", "Baujahr laut Ausweis"),
      kennzahl("effizienzklasse", "Effizienzklasse"),
      kennzahl("heizungsart", "Heizung"),
    ]);
    abschnitte.push({
      id: "energie",
      titel: "Energieausweis",
      bloecke: energieausweisFehlt(f.energieausweis_art?.wert)
        ? [{ art: "hinweis", text: ENERGIEAUSWEIS_FEHLT_TEXT }, ...(energie.length > 1 ? [{ art: "kennzahlen" as const, eintraege: energie.slice(1) }] : [])]
        : [
            { art: "kennzahlen", eintraege: energie },
            ...liste([luecke("energieausweis_art"), luecke("energiekennwert"), luecke("energietraeger")]),
          ],
    });
  }

  const investment = aussagenBloecke("investment");
  const kaufpreis = Number(String(f.kaufpreis?.wert ?? "").replace(/[^\d,]/g, "").replace(",", "."));
  const miete = Number(String(f.ist_miete?.wert ?? "").replace(/[^\d,]/g, "").replace(",", "."));
  if (kaufpreis > 0 && miete > 0) {
    const faktorQuelle: Quelle = {
      id: "berechnung:faktor",
      art: "berechnung",
      bezeichnung: "Kaufpreis geteilt durch Ist-Nettokaltmiete p. a.",
    };
    investment.unshift({
      art: "kennzahlen",
      eintraege: [
        { label: "Faktor (Ist)", wert: `${(kaufpreis / miete).toLocaleString("de-DE", { maximumFractionDigits: 1 })}-fach`, quellen: nimm(faktorQuelle) },
        { label: "Bruttorendite (Ist)", wert: `${((miete / kaufpreis) * 100).toLocaleString("de-DE", { maximumFractionDigits: 2 })} %`, quellen: [faktorQuelle.id] },
      ],
    });
  }
  abschnitte.push({
    id: "investment",
    titel: "Investment-Summary",
    bloecke: investment.length ? investment : [{ art: "luecke", text: "Investment-Summary noch nicht erfasst." }],
  });

  if (typ === "expose") {
    abschnitte.push({
      id: "provision",
      titel: "Provision",
      bloecke: f.provision?.wert
        ? [{ art: "absatz", text: `Käuferprovision: ${f.provision.wert}`, quellen: nimm(f.provision.quelle) }]
        : [{ art: "luecke", text: "Käuferprovision" }],
    });
  }

  const hinweise: Block[] = [];
  const rechtlich = (label: string, text: string | undefined) =>
    hinweise.push(istPlatzhalter(text) ? { art: "luecke", text: label } : { art: "hinweis", text: text!.trim() });
  if (typ === "teaser" && f.provision?.wert) hinweise.push({ art: "hinweis", text: `Käuferprovision: ${f.provision.wert}` });
  rechtlich("Provisionshinweis", design.provisionshinweis);
  rechtlich("Haftungshinweis", design.disclaimer);
  if (typ === "expose") rechtlich("Widerrufsbelehrung", design.widerrufsbelehrung);
  abschnitte.push({ id: "rechtliches", titel: "Hinweise", bloecke: hinweise });

  return {
    typ,
    titel: optionen.titel,
    untertitel: typ === "expose" ? f.adresse?.wert : f.lage_ort?.wert,
    datum: optionen.datum ?? new Date().toISOString(),
    abschnitte,
    quellen,
    stempel: optionen.freigegeben ? undefined : "ENTWURF",
  };
}

/** Zitat-Prüfung: Ein Beleg aus einer Unterlage zählt nur, wenn das Zitat auf der Seite steht. */
export function zitatAufSeite(unterlageText: string, seite: number, zitat: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const teile = unterlageText.split(/<<<PAGE (\d+)>>>/);
  for (let i = 1; i < teile.length; i += 2) {
    if (Number(teile[i]) === seite) return norm(teile[i + 1] ?? "").includes(norm(zitat));
  }
  return false;
}
