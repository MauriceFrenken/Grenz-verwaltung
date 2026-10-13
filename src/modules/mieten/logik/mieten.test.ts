import { describe, expect, it } from "vitest";
import { erzeugeSeed } from "@/lib/db/mock/seed";
import type { MietEingang, Mietkonto, MietMonat } from "@/lib/db/mieten";
import type { Lease } from "@/lib/db/typen";
import { mietKontoAusDb } from "@/modules/immobilien/logik/mieten";
import {
  besterVorschlag,
  letzteMonate,
  mietenDemo,
  monatsKennzahlen,
  namensteile,
  rueckstaende,
  textNorm,
  ueberzahlungen,
  vorschlaege,
} from "./mieten";

function monatZeile(teil: Partial<MietMonat> & { monat: string }): MietMonat {
  return {
    leaseId: "mv-1",
    faellig: `${teil.monat.slice(0, 7)}-05`,
    soll: 1000,
    bezahlt: 1000,
    offen: 0,
    status: "bezahlt",
    quelle: "vertrag",
    ...teil,
  };
}

function konto(teil: Partial<Mietkonto> = {}): Mietkonto {
  return {
    leaseId: "mv-1",
    mieter: "Anna Beispiel",
    iban: null,
    vertragStatus: "aktiv",
    beginn: "2020-01-01",
    ende: null,
    erfasstAb: "2025-11-01",
    einheitId: "O-01-W1",
    einheitLage: "EG links",
    nutzungsart: "Wohnung",
    objektId: "O-01",
    objektName: "Musterstraße 1",
    companyId: "G-01",
    vertragsmiete: 1000,
    monatssoll: 1000,
    sollFaellig: 0,
    gezahlt: 0,
    saldo: 0,
    rueckstand: 0,
    offeneMonate: 0,
    aeltesterOffenerMonat: null,
    letzteZahlungAm: null,
    letzteZahlungBetrag: null,
    anzahlZahlungen: 0,
    zahlerBekannt: false,
    stufe: "ok",
    monate: [],
    ...teil,
  };
}

function eingang(teil: Partial<MietEingang> = {}): MietEingang {
  return {
    bankbuchungId: "b-1",
    companyId: "G-01",
    kontoIban: null,
    kontoObjektId: null,
    datum: "2026-10-02",
    betrag: 1000,
    gegenIban: null,
    zahler: "",
    zweck: "",
    sammelzahler: false,
    kaution: false,
    entscheidung: null,
    ...teil,
  };
}

describe("letzteMonate", () => {
  it("liefert n Monatsersten bis zum laufenden Monat, über den Jahreswechsel", () => {
    expect(letzteMonate("2026-02-14", 4)).toEqual([
      "2025-11-01",
      "2025-12-01",
      "2026-01-01",
      "2026-02-01",
    ]);
  });
});

describe("monatsKennzahlen", () => {
  it("summiert Soll und Eingang eines Monats über alle Konten", () => {
    const konten = [
      konto({ monate: [monatZeile({ monat: "2026-10-01" })] }),
      konto({
        leaseId: "mv-2",
        monate: [
          monatZeile({
            monat: "2026-10-01",
            soll: 500,
            bezahlt: 200,
            offen: 300,
            status: "teilweise",
          }),
        ],
      }),
      konto({ leaseId: "mv-3", monate: [] }),
    ];
    const k = monatsKennzahlen(konten, "2026-10-01");
    expect(k.soll).toBe(1500);
    expect(k.bezahlt).toBe(1200);
    expect(k.offen).toBe(300);
    expect(k.vertraege).toBe(2);
    expect(k.offeneVertraege).toBe(1);
    expect(k.faellig).toBe(true);
    expect(k.quote).toBeCloseTo(0.8);
  });

  it("ist vor dem Fälligkeitstag noch nicht fällig", () => {
    const k = monatsKennzahlen(
      [
        konto({
          monate: [
            monatZeile({
              monat: "2026-11-01",
              bezahlt: 0,
              offen: 1000,
              status: "noch_nicht_faellig",
            }),
          ],
        }),
      ],
      "2026-11-01",
    );
    expect(k.faellig).toBe(false);
    expect(k.offen).toBe(1000);
  });
});

describe("rueckstaende und ueberzahlungen", () => {
  it("sortiert nach Stufe, dann nach Betrag", () => {
    const liste = rueckstaende([
      konto({ leaseId: "a", rueckstand: 500, stufe: "offen" }),
      konto({ leaseId: "b", rueckstand: 2500, stufe: "kuendigung_pruefen" }),
      konto({ leaseId: "c", rueckstand: 1200, stufe: "mahnen" }),
      konto({ leaseId: "d", rueckstand: 0.4, stufe: "ok" }),
    ]);
    expect(liste.map((k) => k.leaseId)).toEqual(["b", "c", "a"]);
  });

  it("findet Mieter, die mehr als eine halbe Monatsmiete voraus sind", () => {
    const liste = ueberzahlungen([
      konto({ leaseId: "a", saldo: -400 }),
      konto({ leaseId: "b", saldo: -600 }),
    ]);
    expect(liste.map((k) => k.leaseId)).toEqual(["b"]);
  });
});

describe("textNorm und namensteile", () => {
  it("vereinheitlicht Umlaute, ß und Satzzeichen wie die Datenbank", () => {
    expect(textNorm("Müller-Lüdenscheidt, Jürgen")).toBe(
      "muller ludenscheidt jurgen",
    );
    expect(textNorm("Mueller")).toBe(textNorm("Müller"));
    expect(textNorm("Straße")).toBe("strasse");
  });

  it("lässt Anreden und kurze Wörter weg", () => {
    expect(namensteile("Herr Dr. Max Mustermann GmbH")).toEqual(["mustermann"]);
  });
});

describe("vorschlaege", () => {
  const konten = [
    konto({ leaseId: "mv-1", mieter: "Anna Beispiel", monatssoll: 1000 }),
    konto({
      leaseId: "mv-2",
      mieter: "Bernd Kaiser",
      monatssoll: 750,
      iban: "DE11",
    }),
    konto({ leaseId: "mv-3", mieter: "Fremd Gesellschaft", companyId: "G-09" }),
  ];

  it("schlägt den Vertrag mit passendem Namen und Betrag vor", () => {
    const e = eingang({ zahler: "BEISPIEL, ANNA", betrag: 1000 });
    const [a] = vorschlaege(e, konten);
    expect(a.konto.leaseId).toBe("mv-1");
    expect(a.gruende).toEqual(["Name", "Betrag"]);
    expect(besterVorschlag(e, konten)?.konto.leaseId).toBe("mv-1");
  });

  it("bewertet eine bekannte IBAN am höchsten", () => {
    const e = eingang({ zahler: "Unbekannt", gegenIban: "DE11", betrag: 10 });
    expect(besterVorschlag(e, konten)?.konto.leaseId).toBe("mv-2");
  });

  it("zeigt nur Verträge derselben Gesellschaft", () => {
    const ids = vorschlaege(eingang(), konten).map((v) => v.konto.leaseId);
    expect(ids).not.toContain("mv-3");
  });

  it("macht bei Gleichstand keinen Schnellvorschlag", () => {
    const e = eingang({ zahler: "Sonstwer", betrag: 5 });
    expect(besterVorschlag(e, konten)).toBeNull();
  });

  it("sucht beim Jobcenter den Namen im Verwendungszweck, nicht im Zahler", () => {
    const e = eingang({
      zahler: "Bundesagentur fuer Arbeit Kaiser",
      zweck: "Miete Kaiser Bernd 1234567",
      sammelzahler: true,
      betrag: 600,
    });
    const [a] = vorschlaege(e, konten);
    expect(a.konto.leaseId).toBe("mv-2");
    expect(a.gruende).toEqual(["Name im Text"]);
  });
});

describe("mietKontoAusDb", () => {
  const lease: Lease = {
    id: "mv-1",
    unitId: "u-1",
    tenantId: "t-1",
    start: "2020-01-01",
    end: null,
    baseRent: 800,
    serviceCharge: 200,
    deposit: 0,
    lastRentIncrease: null,
  };

  it("übernimmt nur fällige Monate und setzt die Ampel nach der Stufe", () => {
    const k = mietKontoAusDb(
      lease,
      konto({
        rueckstand: 2000,
        stufe: "kuendigung_pruefen",
        monate: [
          monatZeile({ monat: "2026-09-01", bezahlt: 0, offen: 1000 }),
          monatZeile({ monat: "2026-10-01", bezahlt: 0, offen: 1000 }),
          monatZeile({
            monat: "2026-11-01",
            bezahlt: 0,
            offen: 1000,
            status: "noch_nicht_faellig",
          }),
        ],
      }),
    );
    expect(k.monate.map((m) => m.monat)).toEqual(["2026-09", "2026-10"]);
    expect(k.sollSumme).toBe(2000);
    expect(k.istSumme).toBe(0);
    expect(k.rueckstandMonate).toBe(2);
    expect(k.ampel).toBe("rot");
  });
});

describe("mietenDemo", () => {
  it("baut aus den Musterdaten Konten mit Monatsverlauf und Zahlungen", () => {
    const { daten, zahlungen } = mietenDemo(erzeugeSeed("2026-10-13"));
    expect(daten.konten.length).toBeGreaterThan(0);
    expect(daten.konten.every((k) => k.monate.length > 0)).toBe(true);
    expect(zahlungen.length).toBeGreaterThan(0);
    expect(daten.konten.some((k) => k.stufe !== "ok")).toBe(true);
  });
});
