/**
 * Erzeugt docs/testdaten/testdaten_darlehensregister.xlsx mit fiktiven Daten:
 * 25 Darlehen aus den Seed-Daten, 2 neue gültige Darlehen und 2 fehlerhafte Zeilen.
 * Aufruf: npm run testdaten:darlehen
 */
import { writeFileSync } from "node:fs";
import { erzeugeSeed } from "@/lib/db/mock/seed";
import { excelSchreiben } from "@/lib/integrations/excel";
import { darlehenZuZeile, SPALTEN } from "@/modules/darlehen/logik/import";

export const TESTDATEN_STICHTAG = "2026-10-07";
export const TESTDATEN_PFAD = "docs/testdaten/testdaten_darlehensregister.xlsx";

export function testdatenZeilen() {
  const d = erzeugeSeed(TESTDATEN_STICHTAG);
  const zeilen = d.loans.map((l) => darlehenZuZeile(l, d));
  const leer = Object.fromEntries(Object.values(SPALTEN).map((s) => [s, ""]));
  zeilen.push({
    ...leer,
    [SPALTEN.id]: "DL-2026-026",
    [SPALTEN.art]: "Intercompany",
    [SPALTEN.geber]: "Muster Holding GmbH",
    [SPALTEN.nehmer]: "Muster Capital GmbH",
    [SPALTEN.betrag]: "120.000,00",
    [SPALTEN.auszahlung]: "01.07.2026",
    [SPALTEN.zins]: "3,0",
    [SPALTEN.zinsart]: "fest",
    [SPALTEN.tilgungsart]: "endfällig",
    [SPALTEN.zahlweise]: "jährlich",
    [SPALTEN.zinsmethode]: "act/365",
    [SPALTEN.zweck]: "Liquiditätsausgleich",
  });
  zeilen.push({
    ...leer,
    [SPALTEN.id]: "DL-2026-027",
    [SPALTEN.art]: "Gesellschafter",
    [SPALTEN.geber]: "Max Mustermann",
    [SPALTEN.nehmer]: "MBT",
    [SPALTEN.betrag]: 80000,
    [SPALTEN.auszahlung]: "15.08.2026",
    [SPALTEN.zins]: 3,
    [SPALTEN.tilgungsart]: "endfällig",
    [SPALTEN.zahlweise]: "jährlich",
    [SPALTEN.zweck]: "Anschubfinanzierung Plattform",
  });
  zeilen.push({
    ...leer,
    [SPALTEN.id]: "DL-26-028",
    [SPALTEN.art]: "Intercompany",
    [SPALTEN.geber]: "Muster Holding GmbH",
    [SPALTEN.nehmer]: "Muster Immobilien GmbH",
    [SPALTEN.betrag]: "50.000",
    [SPALTEN.auszahlung]: "01.09.2026",
    [SPALTEN.zins]: "3",
    [SPALTEN.zahlweise]: "jährlich",
  });
  zeilen.push({
    ...leer,
    [SPALTEN.id]: "DL-2026-029",
    [SPALTEN.art]: "Intercompany",
    [SPALTEN.geber]: "Muster Holding GmbH",
    [SPALTEN.nehmer]: "Unbekannte Projekt GmbH",
    [SPALTEN.betrag]: "75.000",
    [SPALTEN.auszahlung]: "31.02.2026",
    [SPALTEN.zins]: "3",
    [SPALTEN.zahlweise]: "jährlich",
  });
  return zeilen;
}

{
  writeFileSync(
    TESTDATEN_PFAD,
    excelSchreiben(testdatenZeilen(), "Darlehensregister"),
  );
  console.log(`Geschrieben: ${TESTDATEN_PFAD}`);
}
