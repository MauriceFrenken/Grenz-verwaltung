import { useMemo } from "react";
import { plusTage } from "@/lib/kalender";
import type { BoardDaten } from "@/lib/db/typen";
import { abgleichen, abgleichsQuote, sollZahlungen } from "./logik/abgleich";
import {
  darlehenPruefFaelle,
  darlehenStand,
  faelligkeiten,
  matrix,
} from "./logik/auswertung";

/** Alle abgeleiteten Darlehensdaten (Zinspläne, Abgleich, Fälligkeiten, Matrix, Prüffälle). */
export function darlehenAuswerten(daten: BoardDaten) {
  const stichtag = daten.stichtag;
  const staende = daten.loans.map((l) => darlehenStand(l, stichtag));
  const plaene = new Map(staende.map((s) => [s.loan.id, s.plan]));
  const soll = sollZahlungen(
    daten.loans,
    plaene,
    {
      companies: daten.companies,
      parties: daten.parties,
      accounts: daten.bankAccounts,
    },
    plusTage(stichtag, -365),
    plusTage(stichtag, 30),
  );
  const abgleich = abgleichen(
    soll,
    daten.transactions,
    daten.bankAccounts,
    stichtag,
  );
  return {
    stichtag,
    staende,
    abgleich,
    quote: abgleichsQuote(abgleich),
    faelligkeiten: faelligkeiten(staende, stichtag),
    matrix: matrix(staende),
    pruefFaelle: darlehenPruefFaelle(abgleich, staende, stichtag),
  };
}

export type DarlehenAuswertung = ReturnType<typeof darlehenAuswerten>;

export function useDarlehenAuswertung(daten: BoardDaten | undefined) {
  return useMemo(() => (daten ? darlehenAuswerten(daten) : null), [daten]);
}
