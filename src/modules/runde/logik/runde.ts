/**
 * Wochenrunde der Geschäftsführung: Tagesordnung aus den echten Daten und
 * Stand der Beschlüsse (reine Funktionen, ohne React).
 *
 * Feste Reihenfolge, je Punkt eine Aussage, eine Zahl, eine Ampel und
 * höchstens fünf Zeilen. Fehlen Daten, sagt der Punkt das, statt zu schätzen.
 */
import type { Ampel } from "@/components/board/ampel";
import { plusTage, wochentag, type IsoDatum } from "@/lib/kalender";
import type { Beschluss, DatenLuecke, ReviewItem } from "@/lib/db/typen";
import { datum, euroKompakt, prozent } from "@/lib/format/de";

export interface TopZeile {
  text: string;
  detail?: string;
  ampel?: Ampel;
  /** Datum für einen Countdown */
  datum?: IsoDatum | null;
  rechts?: string;
}

export interface TopPunkt {
  nr: number;
  id:
    | "beschluesse"
    | "geld"
    | "fristen"
    | "transaktionen"
    | "baumaschinen"
    | "immobilien"
    | "daten";
  titel: string;
  /** Kernaussage in einem Satz */
  aussage: string;
  /** Hauptzahl als Text */
  zahl: string;
  zahlLabel: string;
  ampel: Ampel;
  href: string;
  zeilen: TopZeile[];
  /** Vorschlag für einen Beschluss */
  vorschlag: string | null;
}

export interface RundeEingabe {
  stichtag: IsoDatum;
  beschluesse: Beschluss[];
  geld: {
    heute: number;
    tief13: { saldo: number; datum: IsoDatum };
    mindest: number;
    /** Gesellschaften, die in 24 Monaten ihren Puffer unterschreiten */
    unterPuffer: Array<{
      name: string;
      ab: IsoDatum;
      luecke: number;
      ampel: Ampel;
    }>;
    kontenOhneSaldo: number;
    mindestFehlt: number;
  };
  fristen: Array<{
    id: string;
    ereignis: "Ende" | "Zinsbindung";
    datum: IsoDatum;
    restschuld: number;
    nehmer: string;
  }>;
  deals: Array<{
    id: string;
    name: string;
    phase: string;
    naechsterSchritt: string | null;
    naechsterSchrittAm: IsoDatum | null;
    ekBedarf: number;
  }>;
  ekBedarfAbAngebot: number;
  ekFrei: number;
  maschinen: {
    vorhanden: boolean;
    lagerwert: number;
    icFinanzierung: number;
    ueber90: Array<{
      id: string;
      titel: string;
      tage: number;
      einstand: number;
      ampel: Ampel;
    }>;
  };
  immobilienFaelle: ReviewItem[];
  luecken: DatenLuecke[];
}

/** Datum der Wochenrunde: der nächste Montag (am Montag selbst: heute). */
export function rundenDatum(stichtag: IsoDatum): IsoDatum {
  const wt = wochentag(stichtag); // 0 = Sonntag
  const bisMontag = (8 - wt) % 7;
  return plusTage(stichtag, bisMontag);
}

export interface BeschlussLage {
  offen: Beschluss[];
  ueberfaellig: Beschluss[];
  /** erledigt seit der letzten Runde (7 Tage) */
  erledigtNeu: Beschluss[];
}

export function beschlussLage(
  beschluesse: Beschluss[],
  stichtag: IsoDatum,
): BeschlussLage {
  const offen = beschluesse
    .filter((b) => b.status === "offen")
    .sort((a, b) =>
      (a.faelligAm ?? "9999").localeCompare(b.faelligAm ?? "9999"),
    );
  return {
    offen,
    ueberfaellig: offen.filter((b) => b.faelligAm && b.faelligAm < stichtag),
    erledigtNeu: beschluesse.filter(
      (b) =>
        b.status === "erledigt" &&
        b.erledigtAm != null &&
        b.erledigtAm >= plusTage(stichtag, -7),
    ),
  };
}

function schlimmste(ampeln: Ampel[]): Ampel {
  if (ampeln.includes("rot")) return "rot";
  if (ampeln.includes("gelb")) return "gelb";
  if (ampeln.length && ampeln.every((a) => a === "grau")) return "grau";
  return "gruen";
}

export function tagesordnung(e: RundeEingabe): TopPunkt[] {
  const t = e.stichtag;
  const punkte: Omit<TopPunkt, "nr">[] = [];

  // 1. Beschlüsse der letzten Runde
  const bl = beschlussLage(e.beschluesse, t);
  punkte.push({
    id: "beschluesse",
    titel: "Beschlüsse der letzten Runde",
    aussage: bl.offen.length
      ? `${bl.offen.length} Beschlüsse sind offen${bl.ueberfaellig.length ? `, ${bl.ueberfaellig.length} davon über dem Termin` : ""}; ${bl.erledigtNeu.length} seit der letzten Runde erledigt.`
      : "Alle Beschlüsse sind erledigt.",
    zahl: String(bl.offen.length),
    zahlLabel: "offen",
    ampel: bl.ueberfaellig.length ? "rot" : bl.offen.length ? "gelb" : "gruen",
    href: "#beschluesse",
    zeilen: bl.offen.slice(0, 5).map((b) => ({
      text: b.text,
      detail: [b.id, b.verantwortlich].filter(Boolean).join(" · "),
      ampel: b.faelligAm && b.faelligAm < t ? "rot" : "gelb",
      datum: b.faelligAm,
    })),
    vorschlag: null,
  });

  // 2. Geld
  const g = e.geld;
  const geldDatenFehlen = g.kontenOhneSaldo > 0;
  const unter13 = g.unterPuffer.filter((u) => u.ab <= plusTage(t, 91));
  punkte.push({
    id: "geld",
    titel: "Geld",
    aussage: geldDatenFehlen
      ? `Frei heute ${euroKompakt(g.heute)}, aber ${g.kontenOhneSaldo} ${g.kontenOhneSaldo > 1 ? "Konten" : "Konto"} ohne Saldo: die Zahl ist unvollständig.`
      : unter13.length
        ? `${unter13[0].name} unterschreitet ab ${datum(unter13[0].ab)} den Puffer; Lücke ${euroKompakt(unter13[0].luecke)}.`
        : `Frei heute ${euroKompakt(g.heute)}, Tiefpunkt in 13 Wochen ${euroKompakt(g.tief13.saldo)} am ${datum(g.tief13.datum)}.`,
    zahl: euroKompakt(g.heute),
    zahlLabel: "frei heute",
    ampel: geldDatenFehlen
      ? "grau"
      : schlimmste([
          ...g.unterPuffer.map((u) => u.ampel),
          g.mindest && g.tief13.saldo < g.mindest ? "rot" : "gruen",
        ]),
    href: "/board/liquiditaet",
    zeilen: [
      ...g.unterPuffer.slice(0, 4).map((u) => ({
        text: `${u.name} unter Puffer`,
        detail: `Lücke ${euroKompakt(u.luecke)}`,
        ampel: u.ampel,
        datum: u.ab,
      })),
      ...(g.mindestFehlt
        ? [
            {
              text: `Mindestliquidität bei ${g.mindestFehlt} Gesellschaft${g.mindestFehlt > 1 ? "en" : ""} nicht festgelegt`,
              ampel: "grau" as Ampel,
            },
          ]
        : []),
    ],
    vorschlag: unter13.length
      ? `Liquidität für ${unter13[0].name} bis ${datum(unter13[0].ab)} sichern (IC-Darlehen oder Zahlung verschieben)`
      : null,
  });

  // 3. Fristen
  const in30 = plusTage(t, 30);
  punkte.push({
    id: "fristen",
    titel: "Fälligkeiten und Zinsbindung (90 Tage)",
    aussage: e.fristen.length
      ? `${e.fristen.length} Darlehen über ${euroKompakt(e.fristen.reduce((s, f) => s + f.restschuld, 0))} enden oder verlieren die Zinsbindung; das erste am ${datum(e.fristen[0].datum)}.`
      : "In den nächsten 90 Tagen endet kein Darlehen und keine Zinsbindung.",
    zahl: String(e.fristen.length),
    zahlLabel: "Fristen",
    ampel: e.fristen.some((f) => f.datum <= in30)
      ? "rot"
      : e.fristen.length
        ? "gelb"
        : "gruen",
    href: "/board/darlehen",
    zeilen: e.fristen.slice(0, 5).map((f) => ({
      text: `${f.id} · ${f.ereignis}`,
      detail: `${f.nehmer} · ${euroKompakt(f.restschuld)}`,
      ampel: f.datum <= in30 ? "rot" : "gelb",
      datum: f.datum,
    })),
    vorschlag: e.fristen.length
      ? `Anschlussfinanzierung für ${e.fristen[0].id} anfragen`
      : null,
  });

  // 4. Transaktionen
  const woche = plusTage(t, 7);
  const dieseWoche = e.deals.filter(
    (d) => d.naechsterSchrittAm && d.naechsterSchrittAm <= woche,
  );
  const ekEng = e.ekBedarfAbAngebot > e.ekFrei;
  punkte.push({
    id: "transaktionen",
    titel: "Transaktionen",
    aussage: e.deals.length
      ? `${dieseWoche.length} von ${e.deals.length} Deals haben diese Woche einen Schritt. Eigenkapital ab Angebot ${euroKompakt(e.ekBedarfAbAngebot)}, frei ${euroKompakt(e.ekFrei)}${ekEng ? ": priorisieren" : ""}.`
      : "Keine Deals in der Pipeline.",
    zahl: String(dieseWoche.length),
    zahlLabel: "Schritte diese Woche",
    ampel: !e.deals.length
      ? "grau"
      : ekEng
        ? "rot"
        : dieseWoche.some((d) => d.naechsterSchrittAm! < t)
          ? "gelb"
          : "gruen",
    href: "/board/transaktionen",
    zeilen: dieseWoche.slice(0, 5).map((d) => ({
      text: d.name,
      detail: `${d.phase} · ${d.naechsterSchritt ?? "nächsten Schritt festlegen"}`,
      ampel: d.naechsterSchrittAm! < t ? "rot" : "gelb",
      datum: d.naechsterSchrittAm,
      rechts: euroKompakt(d.ekBedarf),
    })),
    vorschlag: ekEng
      ? "Deals priorisieren oder Fremdkapitalquote erhöhen"
      : null,
  });

  // 5. Baumaschinen
  const m = e.maschinen;
  punkte.push({
    id: "baumaschinen",
    titel: "Baumaschinen",
    aussage: !m.vorhanden
      ? `Kein Maschinenbestand im System, obwohl ${euroKompakt(m.icFinanzierung)} interne Darlehen in den Handel fließen.`
      : m.ueber90.length
        ? `${m.ueber90.length} Maschinen stehen über 90 Tage; Lagerwert ${euroKompakt(m.lagerwert)} gegen ${euroKompakt(m.icFinanzierung)} Finanzierung.`
        : `Keine Maschine steht über 90 Tage; Lagerwert ${euroKompakt(m.lagerwert)}.`,
    zahl: m.vorhanden ? String(m.ueber90.length) : "–",
    zahlLabel: "über 90 Tage",
    ampel: !m.vorhanden ? "grau" : schlimmste(m.ueber90.map((x) => x.ampel)),
    href: "/board/baumaschinen",
    zeilen: m.ueber90
      .slice()
      .sort((a, b) => b.tage - a.tage)
      .slice(0, 5)
      .map((x) => ({
        text: x.titel,
        detail: x.id,
        ampel: x.ampel,
        rechts: `${x.tage} T · ${euroKompakt(x.einstand)}`,
      })),
    vorschlag: !m.vorhanden
      ? "Maschinenbestand bis zur nächsten Runde importieren"
      : m.ueber90.some((x) => x.tage >= 180)
        ? "Maschinen über 180 Tage in die nächste Auktion geben"
        : null,
  });

  // 6. Immobilien
  const imm = e.immobilienFaelle.filter((f) => f.status === "offen");
  punkte.push({
    id: "immobilien",
    titel: "Immobilien",
    aussage: imm.length
      ? `${imm.length} offene Punkte im Bestand, davon ${imm.filter((f) => f.severity === "rot").length} rot (Rückstände, Fristen, Leerstand).`
      : "Keine offenen Punkte im Bestand.",
    zahl: String(imm.length),
    zahlLabel: "offene Punkte",
    ampel: schlimmste(imm.map((f) => f.severity)),
    href: "/board/immobilien",
    zeilen: imm
      .slice()
      .sort((a, b) =>
        a.severity === b.severity ? 0 : a.severity === "rot" ? -1 : 1,
      )
      .slice(0, 5)
      .map((f) => ({
        text: f.title,
        detail: f.detail,
        ampel: f.severity,
        datum: f.dueDate,
      })),
    vorschlag: null,
  });

  // 7. Datenlücken
  const rot = e.luecken.filter((l) => l.schwere === "rot");
  punkte.push({
    id: "daten",
    titel: "Datenlücken und offene Fragen",
    aussage: e.luecken.length
      ? `${e.luecken.length} Lücken, ${rot.length} kritisch. Jede Lücke braucht einen Verantwortlichen.`
      : "Keine Datenlücken.",
    zahl: String(e.luecken.length),
    zahlLabel: `davon ${rot.length} kritisch`,
    ampel: rot.length ? "rot" : e.luecken.length ? "gelb" : "gruen",
    href: "/board/daten",
    zeilen: [...rot, ...e.luecken.filter((l) => l.schwere !== "rot")]
      .slice(0, 5)
      .map((l) => ({ text: l.titel, detail: l.detail, ampel: l.schwere })),
    vorschlag: rot.length
      ? `Verantwortliche für ${rot.length} kritische Datenlücken festlegen`
      : null,
  });

  return punkte.map((p, i) => ({ ...p, nr: i + 1 }));
}

/** Anteil erledigter Beschlüsse (für die Kopfzeile). */
export function erledigtQuote(beschluesse: Beschluss[]): string {
  if (!beschluesse.length) return "–";
  return prozent(
    beschluesse.filter((b) => b.status === "erledigt").length /
      beschluesse.length,
    0,
  );
}
