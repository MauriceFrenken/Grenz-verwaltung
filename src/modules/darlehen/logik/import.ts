/**
 * Import des Darlehensregisters aus Excel (eine Zeile je Darlehen).
 * Reine Funktion: bekommt bereits gelesene Zeilen (Spaltenüberschrift → Zellwert)
 * und liefert gültige Darlehen plus Fehlerliste je Zeile.
 */
import {
  loanSchema,
  type Company,
  type Loan,
  type Party,
} from "@/lib/db/typen";
import { parseDeutscheZahl, parseDeutschesDatum } from "@/lib/format/de";

export const SPALTEN = {
  id: "Darlehens-ID",
  bankRef: "Bank-ID",
  art: "Art",
  geber: "Darlehensgeber",
  nehmer: "Darlehensnehmer",
  objekt: "Objekt-ID",
  betrag: "Betrag",
  auszahlung: "Auszahlung",
  zins: "Zinssatz %",
  zinsart: "Zinsart",
  zinsbindung: "Zinsbindung bis",
  ende: "Ende",
  tilgungsart: "Tilgungsart",
  rate: "Rate/Tilgung je Periode",
  zahlweise: "Zahlweise",
  zinsmethode: "Zinsmethode",
  zweck: "Zweck",
  buergschaftVon: "Bürgschaft von",
  buergschaftBetrag: "Bürgschaft Betrag",
} as const;

export interface ImportFehler {
  /** Excel-Zeilennummer (1 = Kopfzeile) */
  zeile: number;
  feld: string;
  meldung: string;
}

export interface ImportErgebnis {
  gueltig: Loan[];
  fehler: ImportFehler[];
  neu: string[];
  aktualisiert: string[];
}

export interface ImportKontext {
  companies: Company[];
  parties: Party[];
  propertyIds: string[];
  vorhandeneIds: string[];
}

type Zeile = Record<string, unknown>;

function text(z: Zeile, spalte: string): string {
  const v = z[spalte];
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

function datum(z: Zeile, spalte: string): string | null {
  const v = z[spalte];
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }
  return parseDeutschesDatum(text(z, spalte));
}

const ART: Record<string, Loan["kind"]> = {
  bank: "bank",
  bankdarlehen: "bank",
  intercompany: "intercompany",
  ic: "intercompany",
  gesellschafter: "gesellschafter",
  gesellschafterdarlehen: "gesellschafter",
};
const ZAHLWEISE: Record<string, Loan["frequency"]> = {
  monatlich: "monatlich",
  quartalsweise: "quartalsweise",
  vierteljaehrlich: "quartalsweise",
  vierteljährlich: "quartalsweise",
  jaehrlich: "jaehrlich",
  jährlich: "jaehrlich",
};
const TILGUNG: Record<string, Loan["repayment"]["kind"]> = {
  annuitaet: "annuitaet",
  annuität: "annuitaet",
  ratentilgung: "ratentilgung",
  endfaellig: "endfaellig",
  endfällig: "endfaellig",
};

export function importiereDarlehen(
  zeilen: Zeile[],
  kontext: ImportKontext,
): ImportErgebnis {
  const fehler: ImportFehler[] = [];
  const gueltig: Loan[] = [];
  const gesehen = new Set<string>();

  const findeGesellschaft = (name: string) => {
    const n = name.toLowerCase();
    return kontext.companies.find(
      (c) => c.name.toLowerCase() === n || c.shortName.toLowerCase() === n,
    );
  };
  const findePartei = (name: string) =>
    kontext.parties.find((p) => p.name.toLowerCase() === name.toLowerCase());

  zeilen.forEach((z, index) => {
    const nr = index + 2;
    const f = (feld: string, meldung: string) =>
      fehler.push({ zeile: nr, feld, meldung });
    const anzahlVorher = fehler.length;

    const id = text(z, SPALTEN.id);
    if (!id) {
      // vollständig leere Zeilen still überspringen
      if (
        Object.values(z).every(
          (v) => v === null || v === undefined || String(v).trim() === "",
        )
      )
        return;
      f(SPALTEN.id, "Darlehens-ID fehlt");
      return;
    }
    if (gesehen.has(id)) f(SPALTEN.id, `Darlehens-ID ${id} kommt mehrfach vor`);
    gesehen.add(id);

    const kind = ART[text(z, SPALTEN.art).toLowerCase()];
    if (!kind)
      f(SPALTEN.art, "Art muss Bank, Intercompany oder Gesellschafter sein");

    const geberName = text(z, SPALTEN.geber);
    const nehmerName = text(z, SPALTEN.nehmer);
    const geberC = findeGesellschaft(geberName);
    const geberP = geberC ? undefined : findePartei(geberName);
    const nehmerC = findeGesellschaft(nehmerName);
    const nehmerP = nehmerC ? undefined : findePartei(nehmerName);
    if (!geberC && !geberP)
      f(
        SPALTEN.geber,
        geberName
          ? `Unbekannter Darlehensgeber „${geberName}“`
          : "Darlehensgeber fehlt",
      );
    if (!nehmerC && !nehmerP)
      f(
        SPALTEN.nehmer,
        nehmerName
          ? `Unbekannter Darlehensnehmer „${nehmerName}“`
          : "Darlehensnehmer fehlt",
      );

    const objekt = text(z, SPALTEN.objekt) || null;
    if (objekt && !kontext.propertyIds.includes(objekt))
      f(SPALTEN.objekt, `Unbekanntes Objekt ${objekt}`);

    const betrag = parseDeutscheZahl(z[SPALTEN.betrag] as string | number);
    if (betrag === null || betrag <= 0)
      f(SPALTEN.betrag, "Betrag fehlt oder ist ungültig");
    const auszahlung = datum(z, SPALTEN.auszahlung);
    if (!auszahlung)
      f(
        SPALTEN.auszahlung,
        "Auszahlungsdatum fehlt oder ist ungültig (TT.MM.JJJJ)",
      );
    const zinsProzent = parseDeutscheZahl(z[SPALTEN.zins] as string | number);
    if (zinsProzent === null)
      f(SPALTEN.zins, "Zinssatz fehlt oder ist ungültig");

    const zahlweise =
      ZAHLWEISE[text(z, SPALTEN.zahlweise).toLowerCase() || "jährlich"];
    if (!zahlweise)
      f(
        SPALTEN.zahlweise,
        "Zahlweise muss monatlich, quartalsweise oder jährlich sein",
      );
    const tilgungsart =
      TILGUNG[text(z, SPALTEN.tilgungsart).toLowerCase() || "endfällig"];
    if (!tilgungsart)
      f(
        SPALTEN.tilgungsart,
        "Tilgungsart muss Annuität, Ratentilgung oder endfällig sein",
      );
    const rate = parseDeutscheZahl(z[SPALTEN.rate] as string | number);
    if (
      tilgungsart &&
      tilgungsart !== "endfaellig" &&
      (rate === null || rate <= 0)
    ) {
      f(SPALTEN.rate, "Rate bzw. Tilgung je Periode fehlt");
    }
    const methodeText = text(z, SPALTEN.zinsmethode).toLowerCase();
    const zinsmethode =
      (["30/360", "act/360", "act/365"] as const).find(
        (m) => m === methodeText,
      ) ??
      (methodeText === ""
        ? kind === "bank"
          ? "30/360"
          : "act/365"
        : undefined);
    if (!zinsmethode)
      f(
        SPALTEN.zinsmethode,
        "Zinsmethode muss 30/360, act/360 oder act/365 sein",
      );

    const buergeVon = text(z, SPALTEN.buergschaftVon);
    const buergeBetrag = parseDeutscheZahl(
      z[SPALTEN.buergschaftBetrag] as string | number,
    );

    if (fehler.length > anzahlVorher) return;

    const repayment: Loan["repayment"] =
      tilgungsart === "annuitaet"
        ? { kind: "annuitaet", installment: rate! }
        : tilgungsart === "ratentilgung"
          ? { kind: "ratentilgung", principalPerPeriod: rate! }
          : { kind: "endfaellig" };

    const kandidat = {
      id,
      bankRef: text(z, SPALTEN.bankRef) || null,
      kind: kind!,
      lenderCompanyId: geberC?.id ?? null,
      lenderPartyId: geberP?.id ?? null,
      borrowerCompanyId: nehmerC?.id ?? null,
      borrowerPartyId: nehmerP?.id ?? null,
      propertyId: objekt,
      principal: betrag!,
      disbursementDate: auszahlung!,
      rate: Math.round(zinsProzent! * 1000) / 100000,
      rateType:
        text(z, SPALTEN.zinsart).toLowerCase() === "variabel"
          ? "variabel"
          : "fest",
      fixedUntil: datum(z, SPALTEN.zinsbindung),
      maturityDate: datum(z, SPALTEN.ende),
      repayment,
      frequency: zahlweise!,
      dayCount: zinsmethode!,
      status: "aktiv",
      guarantee:
        buergeVon && buergeBetrag
          ? { by: buergeVon, amount: buergeBetrag }
          : null,
      purpose: text(z, SPALTEN.zweck),
      oneDriveUrl: null,
    };
    const geprueft = loanSchema.safeParse(kandidat);
    if (!geprueft.success) {
      for (const issue of geprueft.error.issues) {
        f(String(issue.path[0] ?? "Zeile"), issue.message);
      }
      return;
    }
    gueltig.push(geprueft.data);
  });

  // Doppelte IDs: alle Vorkommen verwerfen
  const doppelt = new Set(
    fehler
      .filter((x) => x.meldung.includes("mehrfach"))
      .map((x) => x.meldung.split(" ")[1]),
  );
  const ergebnis = gueltig.filter((l) => !doppelt.has(l.id));
  return {
    gueltig: ergebnis,
    fehler,
    neu: ergebnis
      .filter((l) => !kontext.vorhandeneIds.includes(l.id))
      .map((l) => l.id),
    aktualisiert: ergebnis
      .filter((l) => kontext.vorhandeneIds.includes(l.id))
      .map((l) => l.id),
  };
}

/** Darlehen → Excel-Zeile (für Export und Testdaten). */
export function darlehenZuZeile(
  l: Loan,
  kontext: Pick<ImportKontext, "companies" | "parties">,
): Record<string, string | number> {
  const name = (c: string | null, p: string | null) =>
    kontext.companies.find((x) => x.id === c)?.name ??
    kontext.parties.find((x) => x.id === p)?.name ??
    "";
  const de = (iso: string | null) =>
    iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "";
  return {
    [SPALTEN.id]: l.id,
    [SPALTEN.bankRef]: l.bankRef ?? "",
    [SPALTEN.art]: {
      bank: "Bank",
      intercompany: "Intercompany",
      gesellschafter: "Gesellschafter",
      sonstige: "Sonstige",
    }[l.kind],
    [SPALTEN.geber]: name(l.lenderCompanyId, l.lenderPartyId),
    [SPALTEN.nehmer]: name(l.borrowerCompanyId, l.borrowerPartyId),
    [SPALTEN.objekt]: l.propertyId ?? "",
    [SPALTEN.betrag]: l.principal,
    [SPALTEN.auszahlung]: de(l.disbursementDate),
    [SPALTEN.zins]: Math.round(l.rate * 100000) / 1000,
    [SPALTEN.zinsart]: l.rateType === "fest" ? "fest" : "variabel",
    [SPALTEN.zinsbindung]: de(l.fixedUntil),
    [SPALTEN.ende]: de(l.maturityDate),
    [SPALTEN.tilgungsart]: {
      annuitaet: "Annuität",
      ratentilgung: "Ratentilgung",
      endfaellig: "endfällig",
    }[l.repayment.kind],
    [SPALTEN.rate]:
      l.repayment.kind === "annuitaet"
        ? l.repayment.installment
        : l.repayment.kind === "ratentilgung"
          ? l.repayment.principalPerPeriod
          : "",
    [SPALTEN.zahlweise]: {
      monatlich: "monatlich",
      quartalsweise: "quartalsweise",
      jaehrlich: "jährlich",
    }[l.frequency],
    [SPALTEN.zinsmethode]: l.dayCount,
    [SPALTEN.zweck]: l.purpose,
    [SPALTEN.buergschaftVon]: l.guarantee?.by ?? "",
    [SPALTEN.buergschaftBetrag]: l.guarantee?.amount ?? "",
  };
}
