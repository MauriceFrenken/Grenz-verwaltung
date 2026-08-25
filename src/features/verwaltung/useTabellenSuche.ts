import { useMemo } from "react";

type SuchFeld<T> = (zeile: T) => string | number | null | undefined;

export function useTabellenSuche<T>(
  zeilen: T[],
  suchbegriff: string,
  felder: SuchFeld<T>[],
): T[] {
  return useMemo(() => {
    const q = suchbegriff.trim().toLowerCase();
    if (!q) return zeilen;
    return zeilen.filter((zeile) =>
      felder.some((feld) => {
        const wert = feld(zeile);
        if (wert === null || wert === undefined) return false;
        return String(wert).toLowerCase().includes(q);
      }),
    );
  }, [zeilen, suchbegriff, felder]);
}
