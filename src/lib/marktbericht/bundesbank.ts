/**
 * Zinsumfeld aus der Zeitreihen-Datenbank der Deutschen Bundesbank (offene SDMX-Schnittstelle,
 * kein Schlüssel nötig). Ring 2 des Datenkonzepts. Server-only.
 */

import type { Zeitreihe, Zinsumfeld } from "./typen";

const BASIS = "https://api.statistiken.bundesbank.de/rest/data";

const REIHEN: Omit<Zeitreihe, "werte">[] = [
  {
    id: "bauzins",
    label: "Bauzins (Zinsbindung über 10 Jahre)",
    quelle:
      "Deutsche Bundesbank, Effektivzinssätze Wohnungsbaukredite an private Haushalte, Neugeschäft",
    reihe: "BBIM1/M.DE.B.A2C.P.R.A.2250.EUR.N",
    einheit: "% p. a.",
  },
  {
    id: "bund10",
    label: "Rendite 10-jährige Bundesanleihe",
    quelle:
      "Deutsche Bundesbank, Zinsstruktur börsennotierter Bundeswertpapiere, 10 Jahre Restlaufzeit",
    reihe: "BBSIS/M.I.ZST.ZI.EUR.S1311.B.A604.R10XX.R.A.A._Z._Z.A",
    einheit: "%",
  },
];

/** CSV der Bundesbank: Kopfzeilen, dann „2026-03;3,74;“. */
export function bundesbankCsvWerte(
  csv: string,
): { monat: string; wert: number }[] {
  const werte: { monat: string; wert: number }[] = [];
  for (const zeile of csv.split(/\r?\n/)) {
    const m = /^(\d{4}-\d{2});(-?\d+(?:,\d+)?);/.exec(zeile.trim());
    if (m) werte.push({ monat: m[1], wert: Number(m[2].replace(",", ".")) });
  }
  return werte;
}

function monatMinus(tag: string, monate: number): string {
  const d = new Date(`${tag.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - monate);
  return d.toISOString().slice(0, 7);
}

/** Monatswerte der letzten 36 Monate bis zum Stichtag. */
export async function ladeZinsumfeld(stichtag: string): Promise<Zinsumfeld> {
  const start = monatMinus(stichtag, 36);
  const ende = stichtag.slice(0, 7);
  const reihen: Zeitreihe[] = [];
  const fehler: string[] = [];
  await Promise.all(
    REIHEN.map(async (r) => {
      try {
        const res = await fetch(
          `${BASIS}/${r.reihe}?startPeriod=${start}&endPeriod=${ende}`,
          {
            headers: { Accept: "application/vnd.bbk.data+csv" },
            signal: AbortSignal.timeout(15_000),
          },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const werte = bundesbankCsvWerte(await res.text());
        if (!werte.length) throw new Error("keine Werte");
        reihen.push({ ...r, werte });
      } catch (e) {
        fehler.push(
          `${r.label}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }),
  );
  reihen.sort(
    (a, b) =>
      REIHEN.findIndex((r) => r.id === a.id) -
      REIHEN.findIndex((r) => r.id === b.id),
  );
  return {
    reihen,
    fehler: fehler.length
      ? `Bundesbank-Abruf unvollständig (${fehler.join("; ")})`
      : null,
  };
}

/** Letzter Wert und Veränderung in Basispunkten gegenüber zwölf Monaten davor. */
export function zinsStand(r: Zeitreihe | undefined): {
  wert: number;
  monat: string;
  deltaBp: number | null;
} | null {
  if (!r?.werte.length) return null;
  const letzter = r.werte[r.werte.length - 1];
  const vorjahr = r.werte.find(
    (w) => w.monat === monatMinus(`${letzter.monat}-01`, 12),
  );
  return {
    wert: letzter.wert,
    monat: letzter.monat,
    deltaBp: vorjahr ? Math.round((letzter.wert - vorjahr.wert) * 100) : null,
  };
}
