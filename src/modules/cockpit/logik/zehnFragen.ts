/**
 * Die zehn Fragen des Cockpits als reine Funktion. Jede Antwort sagt, woher
 * die Zahl kommt und ob die Quelle schon echt ist; fehlt eine Pflichtquelle,
 * gibt es keine Zahl, sondern den nächsten Schritt.
 */
import {
  plusMonate,
  plusTage,
  tageZwischen,
  type IsoDatum,
} from "@/lib/kalender";
import { PHASE_LABEL } from "@/lib/db/transaktionen";
import {
  LOAN_KIND_LABEL,
  LOAN_KINDS,
  type BoardDaten,
  type LoanKind,
} from "@/lib/db/typen";
import { schlechtesteAmpel, type Ampel } from "@/components/board/ampel";
import {
  datum,
  euro,
  euroKompakt,
  flaeche,
  monatKurz,
  prozent,
  tagKurz,
} from "@/lib/format/de";
import type { DarlehenAuswertung } from "@/modules/darlehen/useDarlehen";
import {
  leerstandAmpel,
  type ImmobilienAuswertung,
} from "@/modules/immobilien/logik/objekte";
import {
  HORIZONT_TAGE,
  kreisReihe,
  tiefpunkt,
  tragbaresEk,
  type LiquiditaetsAuswertung,
} from "@/modules/liquiditaet/logik/liquiditaet";
import {
  AKTIVE_PHASEN,
  ankaufKennzahlen,
  ekBedarfAbAngebot,
} from "@/modules/transaktionen/logik/transaktionen";
import { handelAuswerten } from "@/modules/baumaschinen/logik/baumaschinen";

/** Schwelle für „große Zahlung“ in Frage 3. */
export const GROSSE_ZAHLUNG = 10_000;
/** Standzeit, ab der eine Maschine in Frage 10 auffällt. */
export const STANDZEIT_TAGE = 90;

/** echt: alle Quellen da; teilweise: Zahl da, aber eine Quelle fehlt oder ist alt. */
export type FrageStand = "echt" | "teilweise" | "fehlt" | "muster";

export interface FrageZeile {
  text: string;
  wert: string;
  ampel?: Ampel;
}

export interface Balken {
  label: string;
  wert: number;
  /** formatierter Wert für die Beschriftung */
  text: string;
  ampel?: Ampel;
}

export interface FrageAntwort {
  nr: number;
  id: string;
  bereich: string;
  frage: string;
  /** große Antwort; null, wenn eine Pflichtquelle fehlt */
  antwort: string | null;
  /** ein Satz unter der Antwort */
  zusatz: string;
  ampel: Ampel;
  /** höchstens drei Einzelposten */
  zeilen: FrageZeile[];
  /** vollständige Reihe für das Diagramm der Kachel */
  balken: Balken[];
  /** Grenzwert im Diagramm, z. B. 90 Tage Standzeit */
  schwelle?: number;
  /** Bedarf gegen Verfügbarkeit (Frage 9) */
  vergleich?: { bedarf: number; verfuegbar: number | null };
  stand: FrageStand;
  /** Quellen in Worten, z. B. „EBICS, Darlehensregister“ */
  quelle: string;
  /** was fehlt und was zu tun ist (bei stand fehlt oder teilweise) */
  hinweis: string | null;
  href: string;
}

export interface FragenEingabe {
  daten: BoardDaten;
  darlehen: DarlehenAuswertung;
  immobilien: ImmobilienAuswertung;
  liquiditaet: LiquiditaetsAuswertung;
  /** Liquiditätskreis: freie Gruppe oder gewählte Gesellschaft */
  ids: string[];
  /** alle Gesellschaften gewählt */
  alle: boolean;
}

// ---------------------------------------------------------------------------
// Quellen
// ---------------------------------------------------------------------------

/** Quellen-IDs aus BoardDaten.datenstand mit kurzer Bezeichnung. */
const QUELLE_KURZ: Record<string, string> = {
  stammdaten: "Stammdaten",
  bankumsaetze: "EBICS-Umsätze",
  kontosalden: "Kontostände",
  darlehen: "Darlehensregister",
  planposten: "Planposten",
  rechnungen: "Offene Rechnungen",
  transaktionen: "Ankaufspipeline",
  maschinen: "Maschinenbestand",
};

/** Tabelle der Board-Migration, die eine Quelle braucht. */
const QUELLE_TABELLE: Record<string, string> = {
  kontosalden: "kontosalden",
  planposten: "planposten",
  maschinen: "maschinen",
};

interface QuellenUrteil {
  stand: FrageStand;
  quelle: string;
  hinweis: string | null;
}

function quellenUrteil(
  daten: BoardDaten,
  pflicht: string[],
  optional: string[] = [],
): QuellenUrteil {
  const quelle = [...pflicht, ...optional]
    .map((id) => QUELLE_KURZ[id] ?? id)
    .join(", ");
  if (daten.quelle === "mock")
    return { stand: "muster", quelle, hinweis: null };
  const status = (id: string) =>
    daten.datenstand.find((q) => q.id === id)?.status ?? "fehlt";
  const grund = (id: string) => {
    const tabelle = QUELLE_TABELLE[id];
    if (
      tabelle &&
      daten.luecken.some((l) => l.id === `system:migration:${tabelle}`)
    )
      return `${QUELLE_KURZ[id]}: Datenbank-Erweiterung fehlt noch (Ben wendet die Migration an)`;
    const q = daten.datenstand.find((x) => x.id === id);
    return `${QUELLE_KURZ[id] ?? id}: ${q?.hinweis ?? "keine Quelle"}`;
  };
  const pflichtFehlt = pflicht.filter((id) => status(id) === "fehlt");
  if (pflichtFehlt.length)
    return {
      stand: "fehlt",
      quelle,
      hinweis: pflichtFehlt.map(grund).join(". "),
    };
  const schwach = [...pflicht, ...optional].filter((id) => status(id) !== "ok");
  if (schwach.length)
    return {
      stand: "teilweise",
      quelle,
      hinweis: schwach.map(grund).join(". "),
    };
  return { stand: "echt", quelle, hinweis: null };
}

// ---------------------------------------------------------------------------
// Die zehn Fragen
// ---------------------------------------------------------------------------

export function zehnFragen(e: FragenEingabe): FrageAntwort[] {
  const { daten, darlehen, immobilien, liquiditaet: l, ids, alle } = e;
  const stichtag = daten.stichtag;
  const passt = (id: string | null | undefined) =>
    alle || (id != null && ids.includes(id));
  const kurzName = (id: string | null | undefined) =>
    daten.companies.find((c) => c.id === id)?.shortName ?? "–";

  const kreis = daten.companies.filter((c) => ids.includes(c.id));
  const min = kreis.reduce((s, c) => s + c.minLiquidity, 0);
  const minGesetzt = kreis.some((c) => c.minLiquidityGesetzt);
  const reihe = kreisReihe(l.verlauf, ids).slice(0, HORIZONT_TAGE + 1);
  const heute = reihe[0]?.wert ?? 0;

  // 1 · Geld heute ------------------------------------------------------------
  const q1 = quellenUrteil(daten, ["kontosalden"], ["bankumsaetze"]);
  const geld = l.gesellschaften
    .filter((g) => ids.includes(g.company.id))
    .sort((a, b) => b.heute - a.heute);
  const frage1: FrageAntwort = {
    nr: 1,
    id: "geld-heute",
    bereich: "Liquidität",
    frage: "Wie viel Geld haben wir heute?",
    antwort: q1.stand === "fehlt" ? null : euroKompakt(heute),
    zusatz: alle
      ? `Freie Gruppenliquidität über ${geld.length} Gesellschaften`
      : `Guthaben ${kurzName(ids[0])}`,
    ampel: !minGesetzt
      ? "grau"
      : heute < min
        ? "rot"
        : heute < 1.5 * min
          ? "gelb"
          : "gruen",
    balken: geld.map((g) => ({
      label: g.company.shortName,
      wert: g.heute,
      text: euroKompakt(g.heute),
      ampel:
        g.company.minLiquidityGesetzt && g.heute < g.company.minLiquidity
          ? ("rot" as const)
          : undefined,
    })),
    zeilen: geld.slice(0, 3).map((g) => ({
      text: g.company.shortName,
      wert: euroKompakt(g.heute),
      ampel:
        g.company.minLiquidityGesetzt && g.heute < g.company.minLiquidity
          ? "rot"
          : undefined,
    })),
    href: "/board/liquiditaet",
    ...q1,
  };

  // 2 · Reicht es 13 Wochen? --------------------------------------------------
  const q2 = quellenUrteil(daten, ["kontosalden"], ["darlehen", "planposten"]);
  const tief = reihe.length ? tiefpunkt(reihe) : null;
  const eng = l.gesellschaften
    .filter(
      (g) =>
        ids.includes(g.company.id) &&
        g.company.minLiquidityGesetzt &&
        g.tief13.saldo < g.company.minLiquidity,
    )
    .sort((a, b) => a.tief13.datum.localeCompare(b.tief13.datum));
  const ampel2: Ampel =
    !tief || !minGesetzt
      ? "grau"
      : tief.saldo < min
        ? "rot"
        : tief.saldo < 1.5 * min || eng.length
          ? "gelb"
          : "gruen";
  const frage2: FrageAntwort = {
    nr: 2,
    id: "reicht-13-wochen",
    bereich: "Liquidität",
    frage: "Reicht das Geld die nächsten 13 Wochen?",
    antwort:
      q2.stand === "fehlt" || !tief
        ? null
        : !minGesetzt
          ? euroKompakt(tief.saldo)
          : { rot: "Nein", gelb: "Knapp", gruen: "Ja", grau: "–" }[ampel2],
    zusatz: tief
      ? `Tiefster Stand ${euroKompakt(tief.saldo)} am ${datum(tief.datum)}${
          minGesetzt
            ? `, Mindestliquidität ${euroKompakt(min)}`
            : "; Mindestliquidität nicht festgelegt"
        }`
      : "Kein Verlauf berechenbar",
    ampel: ampel2,
    balken: eng.map((g) => ({
      label: g.company.shortName,
      wert: g.tief13.saldo,
      text: euroKompakt(g.tief13.saldo),
      ampel: "rot" as const,
    })),
    zeilen: eng.slice(0, 3).map((g) => ({
      text: `${g.company.shortName} unter Minimum, Tiefpunkt ${datum(g.tief13.datum)}`,
      wert: euroKompakt(g.tief13.saldo),
      ampel: "rot" as const,
    })),
    href: "/board/liquiditaet",
    ...q2,
  };

  // 3 · Große Zahlungen 30 Tage ----------------------------------------------
  const q3 = quellenUrteil(daten, ["darlehen"], ["planposten", "rechnungen"]);
  const bis30 = plusTage(stichtag, 30);
  const gross = l.bewegungen
    .filter(
      (b) =>
        b.betrag <= -GROSSE_ZAHLUNG &&
        b.datum > stichtag &&
        b.datum <= bis30 &&
        ids.includes(b.companyId) &&
        !(alle && b.ic),
    )
    .sort((a, b) => a.datum.localeCompare(b.datum));
  const grossSumme = gross.reduce((s, b) => s - b.betrag, 0);
  const frage3: FrageAntwort = {
    nr: 3,
    id: "zahlungen-30-tage",
    bereich: "Liquidität",
    frage: `Welche Zahlungen über ${euroKompakt(GROSSE_ZAHLUNG)} stehen in 30 Tagen an?`,
    antwort: q3.stand === "fehlt" ? null : euroKompakt(grossSumme),
    zusatz: gross.length
      ? `${gross.length} Zahlung${gross.length > 1 ? "en" : ""} bis ${datum(bis30)}`
      : `Keine Zahlung über ${euroKompakt(GROSSE_ZAHLUNG)} bis ${datum(bis30)}`,
    ampel:
      q1.stand !== "fehlt" && grossSumme > Math.max(0, heute - min)
        ? "gelb"
        : "grau",
    balken: gross.map((b) => ({
      label: `${tagKurz(b.datum)} ${b.label}`,
      wert: -b.betrag,
      text: euroKompakt(-b.betrag),
    })),
    zeilen: gross.slice(0, 3).map((b) => ({
      text: `${tagKurz(b.datum)} · ${b.label}`,
      wert: euroKompakt(-b.betrag),
    })),
    href: "/board/liquiditaet",
    ...q3,
  };

  // 4 · Darlehen enden in 12 Monaten ------------------------------------------
  const q4 = quellenUrteil(daten, ["darlehen"]);
  const enden = darlehen.faelligkeiten
    .filter(
      (f) =>
        passt(f.loan.borrowerCompanyId) &&
        tageZwischen(stichtag, f.datum) <= 365,
    )
    .sort((a, b) => a.datum.localeCompare(b.datum));
  const frage4: FrageAntwort = {
    nr: 4,
    id: "darlehen-12-monate",
    bereich: "Finanzierung",
    frage: "Welche Darlehen oder Zinsbindungen laufen in 12 Monaten aus?",
    antwort:
      q4.stand === "fehlt"
        ? null
        : euroKompakt(enden.reduce((s, f) => s + f.restschuld, 0)),
    zusatz: enden.length
      ? `${enden.length} Darlehen enden oder verlieren die Zinsbindung`
      : "Kein Darlehen endet in den nächsten 12 Monaten",
    ampel: enden.length
      ? schlechtesteAmpel(enden.map((f) => f.ampel))
      : "gruen",
    balken: Array.from({ length: 12 }, (_, i) => {
      const monat = plusMonate(stichtag, i).slice(0, 7);
      const im = enden.filter((f) => f.datum.startsWith(monat));
      const wert = im.reduce((s, f) => s + f.restschuld, 0);
      return {
        label: monatKurz(monat),
        wert,
        text: im.length
          ? `${euroKompakt(wert)} · ${im.map((f) => f.loan.id).join(", ")}`
          : "–",
        ampel: im.length
          ? schlechtesteAmpel(im.map((f) => f.ampel))
          : undefined,
      };
    }),
    zeilen: enden.slice(0, 3).map((f) => ({
      text: `${f.loan.id} · ${f.ereignis} ${datum(f.datum)}`,
      wert: euroKompakt(f.restschuld),
      ampel: f.ampel,
    })),
    href: "/board/darlehen",
    ...q4,
  };

  // 5 · Zinsen und Raten gezahlt? ---------------------------------------------
  const q5 = quellenUrteil(daten, ["darlehen", "bankumsaetze"]);
  const faellig = darlehen.abgleich.filter(
    (a) => a.ampel !== "grau" && passt(a.soll.payerCompanyId),
  );
  const fehlend = faellig.filter((a) => a.ampel === "rot");
  const abweichend = faellig.filter((a) => a.ampel === "gelb");
  const quote = faellig.length
    ? faellig.filter((a) => a.ampel === "gruen").length / faellig.length
    : null;
  const frage5: FrageAntwort = {
    nr: 5,
    id: "zinsen-gezahlt",
    bereich: "Finanzierung",
    frage: "Wurden alle fälligen Zinsen und Raten gezahlt?",
    antwort:
      q5.stand === "fehlt" ? null : quote === null ? "–" : prozent(quote, 0),
    zusatz: faellig.length
      ? `${fehlend.length} fehlen, ${abweichend.length} weichen ab, von ${faellig.length} fälligen Zahlungen (12 Monate)`
      : "Keine fälligen Zahlungen in den letzten 12 Monaten",
    ampel: fehlend.length ? "rot" : abweichend.length ? "gelb" : "gruen",
    balken: [
      {
        label: "Pünktlich",
        wert: faellig.length - fehlend.length - abweichend.length,
        text: String(faellig.length - fehlend.length - abweichend.length),
        ampel: "gruen" as const,
      },
      {
        label: "Abweichend",
        wert: abweichend.length,
        text: String(abweichend.length),
        ampel: "gelb" as const,
      },
      {
        label: "Fehlt",
        wert: fehlend.length,
        text: String(fehlend.length),
        ampel: "rot" as const,
      },
    ],
    zeilen: [...fehlend, ...abweichend].slice(0, 3).map((a) => ({
      text: `${a.soll.loanId} · fällig ${datum(a.soll.dueDate)}`,
      wert: euro(a.soll.amount),
      ampel: a.ampel,
    })),
    href: "/board/darlehen",
    ...q5,
  };

  // 6 · Restschuld gesamt und intern ------------------------------------------
  const q6 = quellenUrteil(daten, ["darlehen"]);
  const aktiv = darlehen.staende.filter(
    (s) => s.loan.status === "aktiv" && passt(s.loan.borrowerCompanyId),
  );
  const jeArt = new Map<LoanKind, number>();
  for (const s of aktiv)
    jeArt.set(s.loan.kind, (jeArt.get(s.loan.kind) ?? 0) + s.restschuld);
  const gesamt = aktiv.reduce((s, x) => s + x.restschuld, 0);
  const intern =
    (jeArt.get("intercompany") ?? 0) + (jeArt.get("gesellschafter") ?? 0);
  const frage6: FrageAntwort = {
    nr: 6,
    id: "restschuld",
    bereich: "Finanzierung",
    frage: "Wie hoch ist die Restschuld, und wie viel davon ist intern?",
    antwort: q6.stand === "fehlt" ? null : euroKompakt(gesamt),
    zusatz: `Davon intern ${euroKompakt(intern)}${
      gesamt > 0 ? ` (${prozent(intern / gesamt, 0)})` : ""
    }, ${aktiv.length} aktive Darlehen`,
    ampel: "grau",
    balken: LOAN_KINDS.filter((k) => (jeArt.get(k) ?? 0) > 0).map((k) => ({
      label: LOAN_KIND_LABEL[k],
      wert: jeArt.get(k) ?? 0,
      text: euroKompakt(jeArt.get(k)),
    })),
    zeilen: LOAN_KINDS.filter((k) => (jeArt.get(k) ?? 0) !== 0).map((k) => ({
      text: LOAN_KIND_LABEL[k],
      wert: euroKompakt(jeArt.get(k)),
    })),
    href: "/board/darlehen",
    ...q6,
  };

  // 7 · Mietrückstände ---------------------------------------------------------
  const q7 = quellenUrteil(daten, ["stammdaten", "bankumsaetze"]);
  const unitProp = new Map(daten.units.map((u) => [u.id, u.propertyId]));
  const unitLabel = new Map(daten.units.map((u) => [u.id, u.label]));
  const propFirma = new Map(daten.properties.map((p) => [p.id, p.companyId]));
  const propName = new Map(daten.properties.map((p) => [p.id, p.name]));
  const mieter = new Map(daten.tenants.map((t) => [t.id, t.name]));
  const rueck = immobilien.mietKonten
    .filter(
      (k) =>
        k.rueckstand > 0.005 &&
        passt(propFirma.get(unitProp.get(k.lease.unitId) ?? "")),
    )
    .sort((a, b) => b.rueckstand - a.rueckstand);
  const rueckSumme = rueck.reduce((s, k) => s + k.rueckstand, 0);
  const frage7: FrageAntwort = {
    nr: 7,
    id: "mietrueckstand",
    bereich: "Immobilien",
    frage: "Welche Mieter sind im Rückstand, und mit wie viel?",
    antwort: q7.stand === "fehlt" ? null : euro(rueckSumme),
    zusatz: rueck.length
      ? `${rueck.length} Mieter im Rückstand`
      : "Kein Mieter im Rückstand",
    ampel: rueck.length
      ? schlechtesteAmpel(rueck.map((k) => k.ampel))
      : "gruen",
    balken: rueck.map((k) => ({
      label: mieter.get(k.lease.tenantId) ?? "Mieter",
      wert: k.rueckstand,
      text: euro(k.rueckstand),
      ampel: k.ampel,
    })),
    zeilen: rueck.slice(0, 3).map((k) => ({
      text: `${mieter.get(k.lease.tenantId) ?? "Mieter"} · ${
        propName.get(unitProp.get(k.lease.unitId) ?? "") ?? ""
      } ${unitLabel.get(k.lease.unitId) ?? ""}`.trim(),
      wert: euro(k.rueckstand),
      ampel: k.ampel,
    })),
    href: "/board/mieten",
    ...q7,
  };

  // 8 · Mietausfall durch Leerstand -------------------------------------------
  const q8 = quellenUrteil(daten, ["stammdaten"]);
  const bestand = immobilien.objekte.filter(
    (o) => o.property.strategy === "bestand" && passt(o.property.companyId),
  );
  const ausfallJe = bestand
    .map((o) => {
      const qm = o.property.targetRentPerSqm ?? o.mieteJeQm;
      const leerFlaeche = o.leer.reduce((s, u) => s + u.area, 0);
      return { o, leerFlaeche, ausfall: leerFlaeche * (qm || 0) };
    })
    .filter((x) => x.leerFlaeche > 0)
    .sort((a, b) => b.ausfall - a.ausfall);
  const ausfall = ausfallJe.reduce((s, x) => s + x.ausfall, 0);
  const vermietbar = bestand.reduce((s, o) => s + o.vermietbar, 0);
  const leerGesamt = ausfallJe.reduce((s, x) => s + x.leerFlaeche, 0);
  const leerQuote = vermietbar ? leerGesamt / vermietbar : 0;
  const leerEinheiten = ausfallJe.reduce((s, x) => s + x.o.leer.length, 0);
  const frage8: FrageAntwort = {
    nr: 8,
    id: "leerstand",
    bereich: "Immobilien",
    frage: "Wie viel Miete fehlt durch Leerstand?",
    antwort: q8.stand === "fehlt" ? null : `${euroKompakt(ausfall)} / Monat`,
    zusatz: leerEinheiten
      ? `${leerEinheiten} Einheit${leerEinheiten > 1 ? "en" : ""}, ${flaeche(leerGesamt)} leer, Quote ${prozent(leerQuote, 1)}`
      : "Kein Leerstand im Bestand",
    ampel: leerstandAmpel(leerQuote),
    balken: ausfallJe.map((x) => ({
      label: x.o.property.name,
      wert: x.ausfall,
      text: `${euroKompakt(x.ausfall)} · ${x.o.leer.length} WE`,
      ampel: leerstandAmpel(x.o.leerstandsquote),
    })),
    zeilen: ausfallJe.slice(0, 3).map((x) => ({
      text: `${x.o.property.name} · ${x.o.leer.length} WE`,
      wert: `${euroKompakt(x.ausfall)} / M`,
      ampel: leerstandAmpel(x.o.leerstandsquote),
    })),
    href: "/board/immobilien",
    ...q8,
  };

  // 9 · Hängende Deals und Eigenkapital ---------------------------------------
  const q9 = quellenUrteil(daten, ["transaktionen"], ["kontosalden"]);
  const kennzahlen = daten.crm.ankaeufe
    .filter((a) => alle || passt(a.zielGesellschaftId))
    .map((a) => ankaufKennzahlen(a, stichtag));
  const offen = kennzahlen.filter((k) =>
    AKTIVE_PHASEN.includes(k.ankauf.phase),
  );
  const stockend = offen
    .filter((k) => k.ampel !== "gruen")
    .sort((a, b) => b.tageInPhase - a.tageInPhase);
  const ek = ekBedarfAbAngebot(kennzahlen);
  const salden = daten.datenstand.find((x) => x.id === "kontosalden")?.status;
  const tragbarBekannt = daten.quelle === "mock" || salden !== "fehlt";
  const tragbar = tragbaresEk(kreisReihe(l.verlauf, ids), stichtag, min);
  const frage9: FrageAntwort = {
    nr: 9,
    id: "deals",
    bereich: "Transaktionen",
    frage: "Welche Deals hängen, und wie viel Eigenkapital brauchen sie?",
    antwort: q9.stand === "fehlt" ? null : euroKompakt(ek),
    zusatz: `Eigenkapital ab Angebot${
      tragbarBekannt ? `, frei verfügbar ${euroKompakt(tragbar)}` : ""
    }; ${stockend.length} von ${offen.length} Deals stocken`,
    ampel:
      tragbarBekannt && ek > tragbar
        ? "rot"
        : stockend.some((k) => k.ampel === "rot") ||
            (tragbarBekannt && ek > 0.7 * tragbar)
          ? "gelb"
          : "gruen",
    balken: AKTIVE_PHASEN.map((ph) => {
      const im = offen.filter((k) => k.ankauf.phase === ph);
      const wert = im.reduce((s, k) => s + k.ankauf.angebotspreis, 0);
      return {
        label: PHASE_LABEL[ph],
        wert,
        text: `${euroKompakt(wert)} · ${im.length}`,
      };
    }),
    vergleich: { bedarf: ek, verfuegbar: tragbarBekannt ? tragbar : null },
    zeilen: stockend.slice(0, 3).map((k) => ({
      text: `${k.ankauf.name} · ${PHASE_LABEL[k.ankauf.phase]}`,
      wert: `${k.tageInPhase} Tage`,
      ampel: k.ampel,
    })),
    href: "/board/transaktionen",
    ...q9,
  };

  // 10 · Baumaschinen-Lager ----------------------------------------------------
  const q10 = quellenUrteil(daten, ["maschinen"]);
  const handel = handelAuswerten(daten, (id) => passt(id));
  const lange = handel.bestand
    .filter((m) => (m.lagerTage ?? 0) > STANDZEIT_TAGE)
    .sort((a, b) => (b.lagerTage ?? 0) - (a.lagerTage ?? 0));
  const frage10: FrageAntwort = {
    nr: 10,
    id: "maschinen",
    bereich: "Baumaschinen",
    frage: `Wie viel Kapital steckt im Maschinenlager, und was steht über ${STANDZEIT_TAGE} Tage?`,
    antwort: q10.stand === "fehlt" ? null : euroKompakt(handel.lagerwert),
    zusatz: `${handel.bestand.length} Maschinen im Lager, ${lange.length} länger als ${STANDZEIT_TAGE} Tage`,
    ampel: lange.length
      ? schlechtesteAmpel(lange.map((m) => m.ampel))
      : "gruen",
    balken: [...handel.bestand]
      .sort((a, b) => (b.lagerTage ?? 0) - (a.lagerTage ?? 0))
      .map((m) => ({
        label: `${m.machine.hersteller} ${m.machine.modell}`,
        wert: m.lagerTage ?? 0,
        text: `${m.lagerTage ?? 0} T · ${euroKompakt(m.einstand)}`,
        ampel: m.ampel,
      })),
    schwelle: STANDZEIT_TAGE,
    zeilen: lange.slice(0, 3).map((m) => ({
      text: `${m.machine.hersteller} ${m.machine.modell}`,
      wert: `${m.lagerTage} Tage`,
      ampel: m.ampel,
    })),
    href: "/board/baumaschinen",
    ...q10,
  };

  return [
    frage1,
    frage2,
    frage3,
    frage4,
    frage5,
    frage6,
    frage7,
    frage8,
    frage9,
    frage10,
  ];
}

/** Zählt die Antworten je Stand (für die Kopfzeile). */
export function standZaehlen(
  antworten: FrageAntwort[],
): Record<FrageStand, number> {
  const z: Record<FrageStand, number> = {
    echt: 0,
    teilweise: 0,
    fehlt: 0,
    muster: 0,
  };
  for (const a of antworten) z[a.stand]++;
  return z;
}

export type { IsoDatum };
