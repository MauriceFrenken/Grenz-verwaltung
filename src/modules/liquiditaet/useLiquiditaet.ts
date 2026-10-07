import { useMemo } from "react";
import type { BoardDaten } from "@/lib/db/typen";
import type { DarlehenAuswertung } from "@/modules/darlehen/useDarlehen";
import type { ImmobilienAuswertung } from "@/modules/immobilien/logik/objekte";
import { liquiditaetAuswerten, type Szenario } from "./logik/liquiditaet";

/** Liquiditätsplanung (Basis, optional zusätzlich mit Ankaufs-Szenario). */
export function useLiquiditaetAuswertung(
  daten: BoardDaten | undefined,
  darlehen: DarlehenAuswertung | null,
  immobilien: ImmobilienAuswertung | null,
  szenario?: Szenario | null,
) {
  const basis = useMemo(
    () =>
      daten && darlehen && immobilien
        ? liquiditaetAuswerten(daten, darlehen.staende, immobilien.projekte)
        : null,
    [daten, darlehen, immobilien],
  );
  const mitSzenario = useMemo(
    () =>
      daten && darlehen && immobilien && szenario
        ? liquiditaetAuswerten(daten, darlehen.staende, immobilien.projekte, {
            szenario,
          })
        : null,
    [daten, darlehen, immobilien, szenario],
  );
  return { basis, mitSzenario };
}
