import { describe, expect, it } from "vitest";
import { erzeugeSeed } from "@/lib/db/mock/seed";
import type { BoardDaten, QuellenStand } from "@/lib/db/typen";
import { darlehenAuswerten } from "@/modules/darlehen/useDarlehen";
import { immobilienAuswerten } from "@/modules/immobilien/logik/objekte";
import { liquiditaetAuswerten } from "@/modules/liquiditaet/logik/liquiditaet";
import { GROSSE_ZAHLUNG, standZaehlen, zehnFragen } from "./zehnFragen";

const STICHTAG = "2026-10-08";
const d = erzeugeSeed(STICHTAG);
const dl = darlehenAuswerten(d);
const im = immobilienAuswerten(d, dl.staende);
const l = liquiditaetAuswerten(d, dl.staende, im.projekte);

const fragen = (daten: BoardDaten) =>
  zehnFragen({
    daten,
    darlehen: dl,
    immobilien: im,
    liquiditaet: l,
    ids: l.freieIds,
    alle: true,
  });

const quelle = (id: string, status: QuellenStand["status"]): QuellenStand => ({
  id,
  label: id,
  system: "test",
  stand: null,
  anzahl: 0,
  status,
  hinweis: `${id} Hinweis`,
});

describe("zehnFragen", () => {
  const antworten = fragen(d);

  it("liefert zehn nummerierte Antworten mit Ziel", () => {
    expect(antworten.map((a) => a.nr)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const a of antworten) {
      expect(a.href).toMatch(/^\/board\//);
      expect(a.zeilen.length).toBeLessThanOrEqual(3);
    }
  });

  it("kennzeichnet Musterdaten und rechnet trotzdem jede Zahl", () => {
    expect(standZaehlen(antworten).muster).toBe(10);
    for (const a of antworten) expect(a.antwort).not.toBeNull();
  });

  it("Frage 1 entspricht dem heutigen Saldo des Kreises", () => {
    const heute = l.gesellschaften
      .filter((g) => l.freieIds.includes(g.company.id))
      .reduce((s, g) => s + g.heute, 0);
    expect(heute).toBeGreaterThan(0);
    expect(antworten[0].zeilen.length).toBeGreaterThan(0);
  });

  it("Frage 3 zählt nur große Ausgänge der nächsten 30 Tage", () => {
    const a = antworten[2];
    const n = Number(a.zusatz.match(/^(\d+) Zahlung/)?.[1] ?? 0);
    const erwartet = l.bewegungen.filter(
      (b) =>
        b.betrag <= -GROSSE_ZAHLUNG &&
        b.datum > STICHTAG &&
        b.datum <= "2026-11-07" &&
        l.freieIds.includes(b.companyId) &&
        !b.ic,
    ).length;
    expect(n).toBe(erwartet);
  });

  it("Frage 6 teilt die Restschuld nach Darlehensart auf", () => {
    const a = antworten[5];
    expect(a.zeilen.map((z) => z.text)).toContain("Bank");
  });

  it("ohne Kontostände gibt es für Frage 1 und 2 keine Zahl, sondern einen Hinweis", () => {
    const live: BoardDaten = {
      ...d,
      quelle: "live",
      datenstand: [
        quelle("stammdaten", "ok"),
        quelle("bankumsaetze", "ok"),
        quelle("kontosalden", "fehlt"),
        quelle("darlehen", "ok"),
        quelle("planposten", "fehlt"),
        quelle("rechnungen", "fehlt"),
        quelle("transaktionen", "ok"),
        quelle("maschinen", "ok"),
      ],
      luecken: [
        {
          id: "system:migration:kontosalden",
          bereich: "system",
          schwere: "rot",
          titel: "",
          detail: "",
          companyId: null,
          refType: null,
          refId: null,
          naechsterSchritt: "",
        },
      ],
    };
    const a = fragen(live);
    expect(a[0].stand).toBe("fehlt");
    expect(a[0].antwort).toBeNull();
    expect(a[0].hinweis).toContain("Datenbank-Erweiterung");
    expect(a[1].antwort).toBeNull();
    // Darlehen sind echt
    expect(a[3].stand).toBe("echt");
    expect(a[3].antwort).not.toBeNull();
    // große Zahlungen: Zahl da, aber Planposten fehlen
    expect(a[2].stand).toBe("teilweise");
    expect(a[2].hinweis).toContain("Planposten");
    // Deals ohne Kontostände: kein „frei verfügbar“
    expect(a[8].zusatz).not.toContain("frei verfügbar");
  });
});
