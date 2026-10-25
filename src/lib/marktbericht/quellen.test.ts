import { describe, expect, it } from "vitest";

import {
  benchmarksZusammenfuehren,
  bibliothekAuswahl,
  htmlZuText,
  istSperrseite,
  sichereUrl,
  zitatBelegt,
  type MarktberichtDokument,
} from "./quellen";
import type { Benchmark } from "./typen";

function wert(teil: Partial<Benchmark> = {}): Benchmark {
  return {
    id: crypto.randomUUID(),
    kennzahl: "Spitzenrendite Wohnen",
    region: "Köln",
    wert: 3.81,
    einheit: "%",
    quelle: "BNP Paribas Real Estate, Wohninvestment H1 2026",
    stichtag: "2026-06-30",
    geprueft: true,
    pruefung: "automatisch",
    ...teil,
  };
}

function dok(teil: Partial<MarktberichtDokument> = {}): MarktberichtDokument {
  return {
    id: crypto.randomUUID(),
    quelleId: "q1",
    url: "https://example.com/a.pdf",
    titel: "Bericht",
    art: "pdf",
    stichtag: "2026-06-30",
    region: null,
    status: "ausgelesen",
    fehler: null,
    seiten: 10,
    kennzahlen: [wert()],
    gefundenAm: "2026-07-10T00:00:00Z",
    ausgelesenAm: "2026-07-10T00:00:00Z",
    ...teil,
  };
}

describe("sichereUrl", () => {
  it("lässt öffentliche Adressen zu und entfernt das Fragment", () => {
    expect(sichereUrl("https://www.jll.de/de/trends#x")).toBe(
      "https://www.jll.de/de/trends",
    );
  });
  it("blockt interne Ziele, IPs, Ports und andere Protokolle", () => {
    for (const u of [
      "http://localhost/x",
      "http://127.0.0.1/x",
      "http://169.254.169.254/latest",
      "https://example.com:8443/x",
      "ftp://example.com/x",
      "https://intranet/x",
      "https://user:pw@example.com/",
      "kein link",
    ])
      expect(sichereUrl(u)).toBeNull();
  });
});

describe("htmlZuText", () => {
  it("entfernt Skripte und Navigation, dekodiert Entitäten", () => {
    const t = htmlZuText(
      "<html><nav>Menü</nav><script>var a=1</script><p>Spitzenrendite in K&ouml;ln:&nbsp;3,81&#8239;%</p><p>Zweiter</p></html>",
    );
    expect(t).toContain("Spitzenrendite in Köln: 3,81");
    expect(t).not.toContain("Menü");
    expect(t).not.toContain("var a");
    expect(t.split("\n").length).toBeGreaterThan(1);
  });
});

describe("istSperrseite", () => {
  it("erkennt Lead-Formulare", () => {
    const html =
      '<form><input type="email" name="mail"></form><p>Jetzt herunterladen</p>';
    expect(istSperrseite(html, htmlZuText(html))).toBe(true);
  });
  it("lange Berichtsseiten sind keine Sperrseite", () => {
    const html = `<form><input type="email"></form><p>${"Text ".repeat(1200)}</p>`;
    expect(istSperrseite(html, htmlZuText(html))).toBe(false);
  });
});

describe("zitatBelegt", () => {
  const seiten = [
    "Einleitung",
    "Die Spitzen- rendite für Wohnen in Köln liegt bei 3,81 % und damit 10 bp über dem Vorjahr.",
    "Anhang",
  ];
  it("findet das Zitat trotz Silbentrennung und Leerraum", () => {
    expect(
      zitatBelegt(
        {
          zitat: "Die Spitzenrendite für Wohnen in Köln liegt bei 3,81 %",
          wert: 3.81,
          seite: 2,
        },
        seiten,
      ),
    ).toBe(true);
  });
  it("findet es auch bei falscher Seitenangabe", () => {
    expect(
      zitatBelegt(
        { zitat: "in Köln liegt bei 3,81 %", wert: 3.81, seite: 9 },
        seiten,
      ),
    ).toBe(true);
  });
  it("lehnt ab, wenn die Zahl nicht im Zitat steht", () => {
    expect(
      zitatBelegt({ zitat: "in Köln liegt bei 3,81 %", wert: 3.9 }, seiten),
    ).toBe(false);
  });
  it("lehnt erfundene Zitate ab", () => {
    expect(
      zitatBelegt(
        { zitat: "in Düsseldorf liegt bei 3,81 %", wert: 3.81 },
        seiten,
      ),
    ).toBe(false);
  });
  it("versteht Tausenderpunkte", () => {
    expect(
      zitatBelegt({ zitat: "Volumen von 1.250 Mio. €", wert: 1250 }, [
        "Ein Volumen von 1.250 Mio. € wurde erreicht.",
      ]),
    ).toBe(true);
  });
});

describe("bibliothekAuswahl", () => {
  const namen = new Map([["q1", "BNPP"]]);
  it("nimmt nur belegte Werte im Zeitfenster und die jüngsten je Quelle", () => {
    const werte = bibliothekAuswahl(
      [
        dok(),
        dok({
          stichtag: "2025-12-31",
          kennzahlen: [wert({ kennzahl: "Alt", stichtag: "2025-12-31" })],
        }),
        dok({ kennzahlen: [wert({ kennzahl: "Offen", geprueft: false })] }),
        dok({
          stichtag: "2027-01-31",
          kennzahlen: [wert({ kennzahl: "Zu neu" })],
        }),
        dok({
          status: "neu",
          kennzahlen: [wert({ kennzahl: "Nicht fertig" })],
        }),
      ],
      { jahr: 2026, art: "H1" },
      namen,
    );
    expect(werte.map((w) => w.kennzahl)).toEqual(["Spitzenrendite Wohnen"]);
    expect(werte[0].dokumentId).toBeTruthy();
  });
  it("sortiert Rheinland vor Deutschland", () => {
    const werte = bibliothekAuswahl(
      [
        dok({
          kennzahlen: [
            wert({ region: "Deutschland", kennzahl: "A", relevanz: 90 }),
            wert({ region: "Düsseldorf", kennzahl: "B", relevanz: 40 }),
          ],
        }),
      ],
      { jahr: 2026, art: "H1" },
      namen,
    );
    expect(werte.map((w) => w.kennzahl)).toEqual(["B", "A"]);
  });
});

describe("benchmarksZusammenfuehren", () => {
  it("fügt keine Dubletten hinzu", () => {
    const a = wert();
    const r = benchmarksZusammenfuehren(
      [a],
      [{ ...a, id: "x" }, wert({ region: "Bonn" })],
    );
    expect(r.hinzugefuegt).toBe(1);
    expect(r.benchmarks).toHaveLength(2);
  });
});
