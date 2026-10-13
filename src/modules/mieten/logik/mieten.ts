/**
 * Mieten-Tracking (reine Funktionen): Kennzahlen je Monat, Rückstandsliste,
 * Zuordnungsvorschläge für offene Eingänge und Demodaten.
 * Soll, Zuordnung und Mietkonto selbst rechnet die Datenbank.
 */
import type { Ampel } from "@/components/board/ampel";
import type {
  MietEingang,
  MietenDaten,
  Mietkonto,
  MietMonat,
  MietStufe,
  MietZahlung,
  MonatStatus,
  ZuordnungsMethode,
} from "@/lib/db/mieten";
import type { BoardDaten } from "@/lib/db/typen";
import { nterWerktag, plusMonate, plusTage, teile } from "@/lib/kalender";

export const STUFE_LABEL: Record<MietStufe, string> = {
  ok: "Ausgeglichen",
  offen: "Offen",
  mahnen: "Mahnen",
  kuendigung_pruefen: "Kündigung prüfen",
};

export const STUFE_AMPEL: Record<MietStufe, Ampel> = {
  ok: "gruen",
  offen: "gelb",
  mahnen: "gelb",
  kuendigung_pruefen: "rot",
};

const STUFE_RANG: Record<MietStufe, number> = {
  kuendigung_pruefen: 0,
  mahnen: 1,
  offen: 2,
  ok: 3,
};

export const MONAT_LABEL: Record<MonatStatus, string> = {
  bezahlt: "Bezahlt",
  noch_nicht_faellig: "Noch nicht fällig",
  teilweise: "Teilweise bezahlt",
  ueberfaellig: "Nicht bezahlt",
};

export const METHODE_LABEL: Record<ZuordnungsMethode, string> = {
  iban: "IBAN",
  zahler: "Bekannter Zahler",
  name: "Name erkannt",
  manuell: "Von Hand",
};

/** Erster Tag des Monats, in dem `tag` liegt. */
export function monatsErster(tag: string): string {
  return `${tag.slice(0, 7)}-01`;
}

/** Die letzten `n` Monate bis einschließlich des Monats von `heute`, älteste zuerst. */
export function letzteMonate(heute: string, n = 12): string[] {
  const erster = monatsErster(heute);
  return Array.from({ length: n }, (_, i) => plusMonate(erster, i - (n - 1)));
}

export interface MonatsKennzahlen {
  monat: string;
  soll: number;
  bezahlt: number;
  offen: number;
  /** Anteil bezahlt am Soll (0–1) */
  quote: number;
  vertraege: number;
  /** Verträge mit offenem Betrag in diesem Monat */
  offeneVertraege: number;
  /** Fälligkeit (3. Werktag) schon überschritten */
  faellig: boolean;
  faelligAm: string | null;
}

/** Soll, Eingang und Offenes eines Monats über alle Mietkonten. */
export function monatsKennzahlen(
  konten: Mietkonto[],
  monat: string,
): MonatsKennzahlen {
  let soll = 0;
  let bezahlt = 0;
  let vertraege = 0;
  let offeneVertraege = 0;
  let faellig = false;
  let faelligAm: string | null = null;
  for (const k of konten) {
    const m = k.monate.find((x) => x.monat === monat);
    if (!m || m.soll <= 0) continue;
    vertraege += 1;
    soll += m.soll;
    bezahlt += m.bezahlt;
    if (m.offen >= 0.01) offeneVertraege += 1;
    if (m.status !== "noch_nicht_faellig") faellig = true;
    faelligAm = m.faellig;
  }
  const r = (v: number) => Math.round(v * 100) / 100;
  return {
    monat,
    soll: r(soll),
    bezahlt: r(bezahlt),
    offen: r(soll - bezahlt),
    quote: soll > 0 ? bezahlt / soll : 1,
    vertraege,
    offeneVertraege,
    faellig,
    faelligAm,
  };
}

/** Mietkonten mit Rückstand, schwerste Stufe und höchster Betrag zuerst. */
export function rueckstaende(konten: Mietkonto[]): Mietkonto[] {
  return konten
    .filter((k) => k.rueckstand >= 1)
    .sort(
      (a, b) =>
        STUFE_RANG[a.stufe] - STUFE_RANG[b.stufe] ||
        b.rueckstand - a.rueckstand,
    );
}

/** Mieter zahlen deutlich mehr als das Soll (Hinweis auf veraltete Stammdaten). */
export function ueberzahlungen(konten: Mietkonto[]): Mietkonto[] {
  return konten
    .filter((k) => k.monatssoll > 0 && k.saldo <= -0.5 * k.monatssoll)
    .sort((a, b) => a.saldo - b.saldo);
}

/** Was am Mietkonto auffällt und was zu tun ist. */
export function kontoHinweis(k: Mietkonto): string | null {
  if (k.monatssoll === 0 && k.vertragsmiete === 0)
    return "Im Mietvertrag steht keine Miete. Bitte Kaltmiete und Vorauszahlung eintragen.";
  if (k.anzahlZahlungen === 0 && !k.zahlerBekannt && k.rueckstand > 0)
    return "Zahler noch unbekannt: Ordnen Sie die erste Zahlung unten bei den offenen Eingängen von Hand zu, danach erkennt das System sie selbst.";
  if (k.monatssoll > 0 && k.saldo <= -0.5 * k.monatssoll)
    return "Der Mieter zahlt mehr als das Soll. Ist eine Mieterhöhung oder neue Vorauszahlung noch nicht erfasst?";
  if (k.stufe === "kuendigung_pruefen")
    return "Rückstand von mindestens zwei Monatsmieten oder mehr als einer Miete über zwei Termine (§ 543 BGB). Kündigung prüfen lassen.";
  if (k.stufe === "mahnen")
    return "Mindestens eine Monatsmiete offen. Mahnung schicken.";
  return null;
}

// ---------------------------------------------------------------- Vorschläge

/** Wie in der Datenbank: klein, ohne Umlaute/Akzente, nur Buchstaben und Ziffern. */
export function textNorm(t: string): string {
  return t
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ae/g, "a")
    .replace(/oe/g, "o")
    .replace(/ue/g, "u")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const STOPPWOERTER = new Set([
  "herr",
  "frau",
  "herrn",
  "familie",
  "eheleute",
  "oder",
  "gmbh",
  "mieter",
  "miete",
  "service",
  "verwaltung",
  "immobilien",
  "garage",
  "stellplatz",
]);

export function namensteile(name: string): string[] {
  return [
    ...new Set(
      textNorm(name)
        .split(" ")
        .filter((w) => w.length >= 4 && !STOPPWOERTER.has(w)),
    ),
  ];
}

export interface Vorschlag {
  konto: Mietkonto;
  punkte: number;
  gruende: string[];
}

/**
 * Passende Verträge für einen offenen Eingang: gleiche Gesellschaft (und Objekt
 * des Kontos), sortiert nach Namenstreffer, IBAN und passendem Betrag.
 */
export function vorschlaege(e: MietEingang, konten: Mietkonto[]): Vorschlag[] {
  const zahler = ` ${textNorm(e.zahler)} `;
  const zweck = ` ${textNorm(e.zweck)} `;
  return konten
    .filter(
      (k) =>
        k.companyId === e.companyId &&
        (!e.kontoObjektId || k.objektId === e.kontoObjektId),
    )
    .map((k) => {
      let punkte = 0;
      const gruende: string[] = [];
      for (const t of namensteile(k.mieter)) {
        if (!e.sammelzahler && zahler.includes(` ${t} `)) {
          punkte += 2;
          gruende.push("Name");
        } else if (zweck.includes(` ${t} `)) {
          punkte += e.sammelzahler ? 2 : 1;
          gruende.push("Name im Text");
        }
      }
      if (e.gegenIban && k.iban === e.gegenIban && !e.sammelzahler) {
        punkte += 5;
        gruende.push("IBAN");
      }
      if (
        k.monatssoll > 0 &&
        Math.abs(e.betrag - k.monatssoll) <= Math.max(1, k.monatssoll * 0.01)
      ) {
        punkte += 2;
        gruende.push("Betrag");
      }
      if (k.anzahlZahlungen === 0 && !k.zahlerBekannt) punkte += 0.5;
      return { konto: k, punkte, gruende: [...new Set(gruende)] };
    })
    .sort(
      (a, b) =>
        b.punkte - a.punkte ||
        a.konto.objektName.localeCompare(b.konto.objektName) ||
        a.konto.einheitId.localeCompare(b.konto.einheitId),
    );
}

/** Eindeutiger Vorschlag für die Schnellzuordnung (Name oder IBAN, klar vorn). */
export function besterVorschlag(
  e: MietEingang,
  konten: Mietkonto[],
): Vorschlag | null {
  const [a, b] = vorschlaege(e, konten);
  if (!a || a.punkte < 3) return null;
  if (b && b.punkte >= a.punkte - 1) return null;
  return a;
}

// ---------------------------------------------------------------- Demodaten

function zufall(seed: string): () => number {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** Musterdaten für den Demo-Modus aus den Musterverträgen des Boards. */
export function mietenDemo(daten: BoardDaten): {
  daten: MietenDaten;
  zahlungen: MietZahlung[];
} {
  const heute = daten.stichtag;
  const monate = letzteMonate(heute, 12);
  const units = new Map(daten.units.map((u) => [u.id, u]));
  const props = new Map(daten.properties.map((p) => [p.id, p]));
  const tenants = new Map(daten.tenants.map((t) => [t.id, t]));
  const konten: Mietkonto[] = [];
  const zahlungen: MietZahlung[] = [];

  daten.leases.forEach((l, i) => {
    if (l.end && l.end < monate[0]) return;
    const unit = units.get(l.unitId);
    const prop = unit ? props.get(unit.propertyId) : undefined;
    if (!unit || !prop) return;
    const soll = Math.round((l.baseRent + l.serviceCharge) * 100) / 100;
    if (soll <= 0) return;
    const r = zufall(l.id);
    // Muster: die meisten zahlen pünktlich, einige teilweise, wenige gar nicht mehr
    const typ =
      i % 11 === 3 ? "stopp" : i % 7 === 2 ? "teilweise" : "puenktlich";
    const name = tenants.get(l.tenantId)?.name ?? "Mieter";
    let gezahlt = 0;
    const kontoMonate: MietMonat[] = [];
    for (const [idx, monat] of monate.entries()) {
      if (l.start > plusTage(plusMonate(monat, 1), -1)) continue;
      const { jahr, monat: mm } = teile(monat);
      const faellig = nterWerktag(jahr, mm, 3);
      const bezahltHier =
        typ === "stopp" && idx >= monate.length - 3
          ? 0
          : typ === "teilweise" && idx === monate.length - 2
            ? Math.round(soll * 0.5)
            : faellig > heute && r() < 0.4
              ? 0
              : soll;
      if (bezahltHier > 0) {
        gezahlt += bezahltHier;
        zahlungen.push({
          bankbuchungId: `demo-${l.id}-${monat}`,
          leaseId: l.id,
          datum: plusTage(monat, Math.floor(r() * 4)),
          betrag: bezahltHier,
          methode: r() < 0.7 ? "iban" : "zahler",
          zahler: name,
          zweck: `Miete ${monat.slice(5, 7)}/${monat.slice(0, 4)} ${unit.label}`,
          buchungBetrag: bezahltHier,
        });
      }
      const ueberfaellig = plusTage(faellig, 3) <= heute;
      const offen = soll - bezahltHier;
      kontoMonate.push({
        leaseId: l.id,
        monat,
        faellig,
        soll,
        bezahlt: bezahltHier,
        offen,
        status:
          offen < 0.01
            ? "bezahlt"
            : !ueberfaellig
              ? "noch_nicht_faellig"
              : bezahltHier > 0
                ? "teilweise"
                : "ueberfaellig",
        quelle: "vertrag",
      });
    }
    const faelligeSoll = kontoMonate
      .filter((m) => m.status !== "noch_nicht_faellig")
      .reduce((s, m) => s + m.soll, 0);
    const offeneMonate = kontoMonate.filter(
      (m) => m.status === "teilweise" || m.status === "ueberfaellig",
    );
    const saldo = Math.round((faelligeSoll - gezahlt) * 100) / 100;
    const rueckstand = Math.max(saldo, 0);
    const letzte = zahlungen.filter((z) => z.leaseId === l.id).at(-1);
    konten.push({
      leaseId: l.id,
      mieter: name,
      iban: tenants.get(l.tenantId)?.iban || null,
      vertragStatus: "aktiv",
      beginn: l.start,
      ende: l.end,
      erfasstAb: monate[0],
      einheitId: unit.id,
      einheitLage: unit.label,
      nutzungsart: unit.kind,
      objektId: prop.id,
      objektName: prop.name,
      companyId: prop.companyId,
      vertragsmiete: soll,
      monatssoll: soll,
      sollFaellig: faelligeSoll,
      gezahlt,
      saldo,
      rueckstand,
      offeneMonate: offeneMonate.length,
      aeltesterOffenerMonat: offeneMonate[0]?.monat ?? null,
      letzteZahlungAm: letzte?.datum ?? null,
      letzteZahlungBetrag: letzte?.betrag ?? null,
      anzahlZahlungen: zahlungen.filter((z) => z.leaseId === l.id).length,
      zahlerBekannt: true,
      stufe:
        rueckstand < 1
          ? "ok"
          : rueckstand >= 2 * soll ||
              (offeneMonate.length >= 2 && rueckstand > soll)
            ? "kuendigung_pruefen"
            : rueckstand >= soll || offeneMonate.length >= 2
              ? "mahnen"
              : "offen",
      monate: kontoMonate,
    });
  });

  const erste = konten[0];
  const eingaenge: MietEingang[] = erste
    ? [
        {
          bankbuchungId: "demo-eingang-1",
          companyId: erste.companyId,
          kontoIban: null,
          kontoObjektId: null,
          datum: plusTage(monatsErster(heute), 1),
          betrag: erste.monatssoll,
          gegenIban: null,
          zahler: `${erste.mieter.split(" ").at(-1)} Hausverwaltung`,
          zweck: `Miete ${erste.einheitLage}`,
          sammelzahler: false,
          kaution: false,
          entscheidung: null,
        },
        {
          bankbuchungId: "demo-eingang-2",
          companyId: erste.companyId,
          kontoIban: null,
          kontoObjektId: null,
          datum: plusTage(monatsErster(heute), 2),
          betrag: 412.37,
          gegenIban: null,
          zahler: "Stadtwerke",
          zweck: "Erstattung Abschlag",
          sammelzahler: false,
          kaution: false,
          entscheidung: null,
        },
      ]
    : [];

  return { daten: { konten, eingaenge }, zahlungen };
}
