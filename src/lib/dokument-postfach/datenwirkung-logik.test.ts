import { describe, expect, it } from "vitest";
import { hinweiseAusAntwort, hinweisSchluessel } from "./datenwirkung-logik";

const bekannt = {
  objekte: new Set(["O-03"]),
  gesellschaften: new Set(["G-02"]),
};

describe("Postfach-Datenhinweise", () => {
  it("liest die KI-Antwort und vereinheitlicht Beträge und Daten", () => {
    const antwort = `Hier das Ergebnis:
{"hinweise":[{"art":"mieterhoehung","titel":"Mieterhöhung Kalkumer Str. 78, Herde",
"beschreibung":"Kaltmiete steigt","aktion":"Mieterhöhung eintragen",
"objekt":"O-03","gesellschaft":"G-02","mieter":"Karina Herde",
"betrag":"1.234,50","betragAlt":520,"gueltigAb":"01.12.2026","faelligAm":null,"konfidenz":0.9}]}`;
    const [h] = hinweiseAusAntwort(antwort, bekannt);
    expect(h).toMatchObject({
      art: "mieterhoehung",
      objektId: "O-03",
      gesellschaftId: "G-02",
      betrag: 1234.5,
      betragAlt: 520,
      gueltigAb: "2026-12-01",
      faelligAm: null,
    });
  });

  it("verwirft unbekannte Arten, unsichere Hinweise und fremde Objekt-IDs", () => {
    const antwort = JSON.stringify({
      hinweise: [
        { art: "werbung", titel: "Newsletter", konfidenz: 0.9 },
        { art: "bank", titel: "Saldo", konfidenz: 0.3 },
        {
          art: "feste_kosten",
          titel: "Grundsteuer",
          objekt: "O-99",
          konfidenz: 0.8,
        },
      ],
    });
    const liste = hinweiseAusAntwort(antwort, bekannt);
    expect(liste).toHaveLength(1);
    expect(liste[0]).toMatchObject({ art: "feste_kosten", objektId: null });
  });

  it("leere oder kaputte Antwort ergibt keine Hinweise", () => {
    expect(hinweiseAusAntwort('{"hinweise":[]}', bekannt)).toEqual([]);
    expect(hinweiseAusAntwort("kein JSON", bekannt)).toEqual([]);
    expect(hinweiseAusAntwort("{kaputt", bekannt)).toEqual([]);
  });

  it("gleicher Sachverhalt aus zwei Anhängen hat denselben Schlüssel", () => {
    const a = {
      art: "mieterhoehung" as const,
      objektId: "O-03",
      mieter: "Karina Herde",
      betrag: 580,
      gueltigAb: "2026-12-01",
      titel: "Mieterhöhung Herde",
    };
    expect(hinweisSchluessel(a)).toBe(
      hinweisSchluessel({ ...a, mieter: "karina herde", titel: "Anders" }),
    );
    expect(hinweisSchluessel(a)).not.toBe(
      hinweisSchluessel({ ...a, betrag: 600 }),
    );
  });
});
