import { useMemo } from "react";
import type { BoardDaten } from "@/lib/db/typen";
import type { DarlehenAuswertung } from "@/modules/darlehen/useDarlehen";
import { immobilienAuswerten } from "./logik/objekte";

export function useImmobilienAuswertung(
  daten: BoardDaten | undefined,
  darlehen: DarlehenAuswertung | null,
) {
  return useMemo(
    () =>
      daten && darlehen ? immobilienAuswerten(daten, darlehen.staende) : null,
    [daten, darlehen],
  );
}
