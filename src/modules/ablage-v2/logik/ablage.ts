import type {
  Dokumenttyp,
  EingangsMail,
  KiAntwort,
  KlassifikationsKontext,
} from "@/lib/ai/klassifikation";
import type { BoardDaten } from "@/lib/db/typen";

/** Ab dieser Gesamtkonfidenz wird automatisch abgelegt, darunter Prüfliste. */
export const AUTO_SCHWELLE = 0.9;

export type FeldQuelle = "regel" | "ki" | "regel+ki" | "keine";

export interface Feld<T> {
  wert: T | null;
  konfidenz: number;
  quelle: FeldQuelle;
}

export interface RegelErgebnis {
  gesellschaftId?: Feld<string>;
  dokumenttyp?: Feld<Dokumenttyp>;
  bezugId?: Feld<string>;
  datum?: Feld<string>;
  betrag?: Feld<number>;
}

export interface AblageVorschlag {
  mail: EingangsMail;
  gesellschaftId: Feld<string>;
  dokumenttyp: Feld<Dokumenttyp>;
  bezugId: Feld<string>;
  datum: Feld<string>;
  betrag: Feld<number>;
  kurzbeschreibung: string;
  /** Ordner relativ zum Gesellschaftsordner */
  ordner: string;
  dateiname: string;
  konfidenz: number;
  pruefen: boolean;
  /** Felder unter der Schwelle (für die Prüfliste) */
  unsicher: string[];
}

// ---------------------------------------------------------------------------
// Kontext
// ---------------------------------------------------------------------------

export function kontextAus(daten: BoardDaten): KlassifikationsKontext {
  const unitProp = new Map(daten.units.map((u) => [u.id, u.propertyId]));
  return {
    gesellschaften: daten.companies.map((c) => ({
      id: c.id,
      kurz: c.shortName,
      name: c.name,
    })),
    objekte: daten.properties.map((p) => ({
      id: p.id,
      companyId: p.companyId,
      name: p.name,
      strasse: p.street,
      ort: p.city,
    })),
    darlehen: daten.loans.map((l) => ({
      id: l.id,
      bankRef: l.bankRef,
      companyId: l.borrowerCompanyId ?? l.lenderCompanyId,
    })),
    mieter: daten.leases.map((l) => ({
      name: daten.tenants.find((t) => t.id === l.tenantId)?.name ?? "",
      objektId: unitProp.get(l.unitId) ?? "",
    })),
  };
}

// ---------------------------------------------------------------------------
// Stufe 1: Regeln (deterministisch, hohe Konfidenz)
// ---------------------------------------------------------------------------

const TYP_REGELN: Array<[RegExp, Dokumenttyp]> = [
  [/\bkontoauszug/i, "Kontoauszug"],
  [/\bzins(mitteilung|bescheinigung|anpassung)/i, "Zinsmitteilung"],
  [/\bdarlehensvertrag/i, "Darlehensvertrag"],
  [/\bmieterhöhung/i, "Mieterhöhung"],
  [/\bkündigung/i, "Kündigung"],
  [/\b(nebenkosten|betriebskosten)abrechnung/i, "Nebenkostenabrechnung"],
  [/\bmietvertrag/i, "Mietvertrag"],
  [/\bkaufvertrag/i, "Kaufvertrag"],
  [/\bversicherungsschein/i, "Versicherung"],
  [/\b(steuer)?bescheid\b|steuerbescheid/i, "Steuerbescheid"],
  [/\b(abschlags|honorar|sammel)?rechnung\b|\binvoice\b/i, "Rechnung"],
];

const r = <T>(wert: T, konfidenz: number): Feld<T> => ({
  wert,
  konfidenz,
  quelle: "regel",
});

export function regelStufe(
  mail: EingangsMail,
  k: KlassifikationsKontext,
): RegelErgebnis {
  const ergebnis: RegelErgebnis = {};
  const voll = `${mail.betreff}\n${mail.text}\n${mail.anhang}`;

  // Bezug über IDs: IM-, DL- oder Bank-Referenz
  const im = voll.match(/\bIM-\d{4}-\d{3}\b/)?.[0];
  const dl = voll.match(/\bDL-\d{4}-\d{3}\b/)?.[0];
  const bk = voll.match(/\bBK-\d{4}-\d{3}\b/)?.[0];
  const objekt = im && k.objekte.find((o) => o.id === im);
  const darlehen =
    (dl && k.darlehen.find((d) => d.id === dl)) ||
    (bk && k.darlehen.find((d) => d.bankRef === bk));
  if (darlehen) {
    ergebnis.bezugId = r(darlehen.id, dl ? 0.99 : 0.97);
    if (darlehen.companyId)
      ergebnis.gesellschaftId = r(darlehen.companyId, 0.97);
  } else if (objekt) {
    ergebnis.bezugId = r(objekt.id, 0.99);
    ergebnis.gesellschaftId = r(objekt.companyId, 0.97);
  }

  // Dokumenttyp nur bei eindeutigem Schlüsselwort im Betreff oder Dateinamen
  const kopf = `${mail.betreff}\n${mail.anhang.replace(/[_-]/g, " ")}`;
  const typen = new Set(
    TYP_REGELN.filter(([re]) => re.test(kopf)).map(([, t]) => t),
  );
  if (typen.size === 1) ergebnis.dokumenttyp = r([...typen][0], 0.96);

  // Datum mit Kontextwort, Betrag mit Euro-Zeichen
  const datum = mail.text.match(
    /(?:vom|datum:?|rechnungsdatum|beurkundet am|zum|ab)\s+(\d{2})\.(\d{2})\.(\d{4})/i,
  );
  if (datum) ergebnis.datum = r(`${datum[3]}-${datum[2]}-${datum[1]}`, 0.95);
  const betrag = mail.text.match(/(\d{1,3}(?:\.\d{3})*,\d{2})\s?€/);
  if (betrag)
    ergebnis.betrag = r(
      Number(betrag[1].replace(/\./g, "").replace(",", ".")),
      0.93,
    );
  return ergebnis;
}

// ---------------------------------------------------------------------------
// Zusammenführung, Ordner, Dateiname
// ---------------------------------------------------------------------------

function zusammenfuehren<T>(
  regel: Feld<T> | undefined,
  ki: { wert: T | null; konfidenz: number } | undefined,
): Feld<T> {
  const kiFeld: Feld<T> | null =
    ki && ki.wert !== null
      ? { wert: ki.wert, konfidenz: ki.konfidenz, quelle: "ki" }
      : null;
  if (regel && kiFeld) {
    if (regel.wert === kiFeld.wert)
      return {
        wert: regel.wert,
        konfidenz: Math.min(
          0.99,
          Math.max(regel.konfidenz, kiFeld.konfidenz) + 0.02,
        ),
        quelle: "regel+ki",
      };
    return regel.konfidenz >= kiFeld.konfidenz ? regel : kiFeld;
  }
  return regel ?? kiFeld ?? { wert: null, konfidenz: 0, quelle: "keine" };
}

/** Dokumenttypen, die ohne Objekt- bzw. Darlehensbezug nicht sinnvoll ablegbar sind. */
const BRAUCHT_OBJEKT: Dokumenttyp[] = [
  "Mietvertrag",
  "Kündigung",
  "Mieterhöhung",
  "Nebenkostenabrechnung",
];
const BRAUCHT_DARLEHEN: Dokumenttyp[] = ["Darlehensvertrag", "Zinsmitteilung"];

/** Ordner relativ zum OneDrive-Ordner der Gesellschaft. */
export function ordnerFuer(
  typ: Dokumenttyp | null,
  bezugId: string | null,
  datum: string | null,
): string {
  const jahr = (datum ?? "").slice(0, 4) || "ohne Jahr";
  const im = bezugId?.startsWith("IM-") ? bezugId : null;
  const dl = bezugId?.startsWith("DL-") ? bezugId : null;
  switch (typ) {
    case "Mietvertrag":
    case "Kündigung":
    case "Mieterhöhung":
      return im ? `Objekte/${im}/Mietverträge` : "Eingang/Zu klären";
    case "Nebenkostenabrechnung":
      return im ? `Objekte/${im}/Nebenkosten` : "Eingang/Zu klären";
    case "Versicherung":
      return im ? `Objekte/${im}/Versicherungen` : "Verträge/Versicherungen";
    case "Kaufvertrag":
      return im ? `Objekte/${im}/Kaufvertrag` : "Verträge";
    case "Rechnung":
      return im
        ? `Objekte/${im}/Rechnungen/${jahr}`
        : `Buchhaltung/Eingangsrechnungen/${jahr}`;
    case "Darlehensvertrag":
    case "Zinsmitteilung":
      return dl ? `Finanzen/Darlehen/${dl}` : "Finanzen/Darlehen";
    case "Kontoauszug":
      return `Finanzen/Bank/${jahr}`;
    case "Steuerbescheid":
      return `Steuern/${jahr}`;
    default:
      return "Eingang/Zu klären";
  }
}

function saeubern(s: string, max: number): string {
  return s
    .normalize("NFC")
    .replace(
      /[äÄöÖüÜß]/g,
      (c) =>
        ({ ä: "ae", Ä: "Ae", ö: "oe", Ö: "Oe", ü: "ue", Ü: "Ue", ß: "ss" })[c]!,
    )
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/, "");
}

/**
 * Dateiname nach Konvention JJJJ-MM-TT_Dokumenttyp_Objekt-ID_Kurzbeschreibung.pdf.
 * Ohne Bezug steht das Gesellschaftskürzel an dritter Stelle.
 */
export function dateiname(
  datum: string | null,
  typ: Dokumenttyp | null,
  bezugOderKuerzel: string | null,
  kurzbeschreibung: string,
  endung = ".pdf",
): string {
  const teile = [
    datum ?? "0000-00-00",
    saeubern(typ ?? "Sonstiges", 30),
    bezugOderKuerzel ? saeubern(bezugOderKuerzel, 20) : "ohne-Bezug",
    saeubern(kurzbeschreibung, 40) || "Dokument",
  ];
  return `${teile.join("_")}${endung}`;
}

function endungAus(anhang: string): string {
  const m = anhang.match(/\.[a-z0-9]{1,5}$/i);
  return m ? m[0].toLowerCase() : ".pdf";
}

/** Stufe 1 (Regeln) + Stufe 2 (KI) → Vorschlag mit Konfidenz je Feld. */
export function ablageVorschlag(
  mail: EingangsMail,
  k: KlassifikationsKontext,
  ki: KiAntwort,
  regeln: RegelErgebnis = regelStufe(mail, k),
): AblageVorschlag {
  const gesellschaftId = zusammenfuehren(
    regeln.gesellschaftId,
    ki.gesellschaftId,
  );
  const dokumenttyp = zusammenfuehren(regeln.dokumenttyp, ki.dokumenttyp);
  let bezugId = zusammenfuehren(regeln.bezugId, ki.bezugId);
  const datum = zusammenfuehren(regeln.datum, ki.datum);
  const betrag = regeln.betrag ?? {
    wert: null,
    konfidenz: 0,
    quelle: "keine" as const,
  };

  // Ein Darlehensbezug bei einem Objekt-Dokumenttyp (oder umgekehrt) passt nicht
  const typ = dokumenttyp.wert;
  if (
    bezugId.wert &&
    typ &&
    ((BRAUCHT_DARLEHEN.includes(typ) && !bezugId.wert.startsWith("DL-")) ||
      (BRAUCHT_OBJEKT.includes(typ) && !bezugId.wert.startsWith("IM-")))
  ) {
    bezugId = { ...bezugId, konfidenz: Math.min(bezugId.konfidenz, 0.4) };
  }

  const bezugNoetig =
    typ !== null &&
    (BRAUCHT_OBJEKT.includes(typ) || BRAUCHT_DARLEHEN.includes(typ));
  const relevant: Array<[string, number]> = [
    ["Gesellschaft", gesellschaftId.wert ? gesellschaftId.konfidenz : 0],
    ["Dokumenttyp", typ && typ !== "Sonstiges" ? dokumenttyp.konfidenz : 0],
    ["Datum", datum.konfidenz],
  ];
  // Bezug zählt, wenn nötig oder wenn ein (unsicherer) Bezug den Ordner bestimmt
  if (bezugNoetig || bezugId.wert)
    relevant.push(["Bezug", bezugId.wert ? bezugId.konfidenz : 0]);
  const konfidenz = Math.min(...relevant.map(([, c]) => c));

  const kurzbeschreibung = ki.kurzbeschreibung.wert ?? mail.betreff;
  const kuerzel =
    k.gesellschaften.find((g) => g.id === gesellschaftId.wert)?.kurz ?? null;
  return {
    mail,
    gesellschaftId,
    dokumenttyp,
    bezugId,
    datum,
    betrag,
    kurzbeschreibung,
    ordner: ordnerFuer(typ, bezugId.wert, datum.wert),
    dateiname: dateiname(
      datum.wert,
      typ,
      bezugId.wert ?? kuerzel,
      kurzbeschreibung,
      endungAus(mail.anhang),
    ),
    konfidenz: Math.round(konfidenz * 100) / 100,
    pruefen: konfidenz < AUTO_SCHWELLE,
    unsicher: relevant.filter(([, c]) => c < AUTO_SCHWELLE).map(([n]) => n),
  };
}

// ---------------------------------------------------------------------------
// Messung
// ---------------------------------------------------------------------------

export interface Erwartung {
  gesellschaft: string | null;
  dokumenttyp: Dokumenttyp;
  bezugId: string | null;
  ordner: string;
}

export interface MessErgebnis {
  vorschlag: AblageVorschlag;
  erwartet: Erwartung;
  /** Gesellschaft und Ordner richtig */
  treffer: boolean;
  /** falsch, aber ohne Prüfung abgelegt (der teure Fehler) */
  fehlablage: boolean;
}

export interface Quote {
  gruppe: string;
  anzahl: number;
  treffer: number;
  quote: number;
  automatisch: number;
  fehlablagen: number;
}

export function messen(
  vorschlaege: AblageVorschlag[],
  erwartungen: Map<string, Erwartung>,
  kurzVonId: (id: string | null) => string | null,
): MessErgebnis[] {
  return vorschlaege.map((v) => {
    const e = erwartungen.get(v.mail.id)!;
    const treffer =
      kurzVonId(v.gesellschaftId.wert) === e.gesellschaft &&
      v.ordner === e.ordner;
    return {
      vorschlag: v,
      erwartet: e,
      treffer,
      fehlablage: !treffer && !v.pruefen,
    };
  });
}

/** Ordnergruppe ohne Jahres-/ID-Ebene, z. B. „Objekte/…/Rechnungen“. */
export function ordnerGruppe(ordner: string): string {
  return ordner.replace(/\/\d{4}$/, "").replace(/\b(IM|DL)-\d{4}-\d{3}\b/, "…");
}

export function quoten(
  ergebnisse: MessErgebnis[],
  schluessel: (e: MessErgebnis) => string,
): Quote[] {
  const gruppen = new Map<string, MessErgebnis[]>();
  for (const e of ergebnisse) {
    const g = schluessel(e);
    gruppen.set(g, [...(gruppen.get(g) ?? []), e]);
  }
  return [...gruppen.entries()]
    .map(([gruppe, liste]) => {
      const treffer = liste.filter((e) => e.treffer).length;
      return {
        gruppe,
        anzahl: liste.length,
        treffer,
        quote: treffer / liste.length,
        automatisch: liste.filter((e) => !e.vorschlag.pruefen).length,
        fehlablagen: liste.filter((e) => e.fehlablage).length,
      };
    })
    .sort((a, b) => a.gruppe.localeCompare(b.gruppe));
}
