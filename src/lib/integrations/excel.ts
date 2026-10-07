/**
 * Excel lesen/schreiben (SheetJS). Keine externe Verbindung, daher ohne Mock/Live-Trennung.
 * Später: Datei direkt aus OneDrive über microsoft-graph laden.
 */
import * as XLSX from "xlsx";

/** Liest das erste (oder benannte) Tabellenblatt als Zeilenobjekte (Kopfzeile = Schlüssel). */
export function excelLesen(
  daten: ArrayBuffer | Uint8Array,
  blatt?: string,
): Record<string, unknown>[] {
  const mappe = XLSX.read(daten, { type: "array", cellDates: true });
  const name =
    blatt && mappe.SheetNames.includes(blatt) ? blatt : mappe.SheetNames[0];
  if (!name) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(mappe.Sheets[name], {
    defval: null,
    raw: true,
  });
}

/** Erzeugt eine Excel-Datei mit einem Blatt aus Zeilenobjekten. */
export function excelSchreiben(
  zeilen: Record<string, unknown>[],
  blatt = "Darlehen",
): Uint8Array {
  const mappe = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(zeilen);
  XLSX.utils.book_append_sheet(mappe, ws, blatt);
  return new Uint8Array(
    XLSX.write(mappe, { type: "array", bookType: "xlsx" }) as ArrayBuffer,
  );
}
