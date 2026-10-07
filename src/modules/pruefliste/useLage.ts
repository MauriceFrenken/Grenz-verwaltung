import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { boardRepository } from "@/lib/db/config";
import type { ReviewItem } from "@/lib/db/typen";
import { useAblageVorschlaege } from "@/modules/ablage-v2/useAblage";
import { useDarlehenAuswertung } from "@/modules/darlehen/useDarlehen";
import { useImmobilienAuswertung } from "@/modules/immobilien/useImmobilien";
import { useLiquiditaetAuswertung } from "@/modules/liquiditaet/useLiquiditaet";
import {
  ankaufKennzahlen,
  einheitenVertrieb,
  pipelinePruefFaelle,
} from "@/modules/pipeline/logik/pipeline";
import { useCrmDaten } from "@/modules/pipeline/useCrm";
import { useBoardDaten } from "@/modules/shell/daten";
import {
  ablagePruefFaelle,
  liquiditaetPruefFaelle,
  prueflisteZusammenfuehren,
} from "./logik/pruefliste";

export const ERLEDIGT_KEY = ["board", "pruefliste", "erledigt"] as const;

/**
 * Gesamtlage aller Module: Grundlage für Cockpit und Prüfliste.
 * Jede Fachauswertung wird nur einmal berechnet (Memo je Datenstand).
 */
export function useLage() {
  const daten = useBoardDaten();
  const data = daten.data;
  const darlehen = useDarlehenAuswertung(data);
  const immobilien = useImmobilienAuswertung(data, darlehen);
  const { basis: liquiditaet } = useLiquiditaetAuswertung(
    data,
    darlehen,
    immobilien,
  );
  const crm = useCrmDaten(data);
  const ablage = useAblageVorschlaege(data);
  const erledigt = useQuery({
    queryKey: ERLEDIGT_KEY,
    queryFn: () => boardRepository().erledigtePruefFaelle(),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const faelle = useMemo<ReviewItem[] | null>(() => {
    if (
      !data ||
      !darlehen ||
      !immobilien ||
      !liquiditaet ||
      !crm.data ||
      !ablage.data ||
      !erledigt.data
    )
      return null;
    const k = crm.data.ankaeufe.map((a) => ankaufKennzahlen(a, data.stichtag));
    return prueflisteZusammenfuehren(
      [
        data.reviewItems,
        liquiditaetPruefFaelle(liquiditaet),
        darlehen.pruefFaelle,
        immobilien.pruefFaelle,
        pipelinePruefFaelle(
          einheitenVertrieb(data, crm.data),
          k,
          data,
          data.stichtag,
        ),
        ablagePruefFaelle(ablage.data, data.stichtag),
      ],
      new Set(erledigt.data),
    );
  }, [
    data,
    darlehen,
    immobilien,
    liquiditaet,
    crm.data,
    ablage.data,
    erledigt.data,
  ]);

  return {
    data,
    darlehen,
    immobilien,
    liquiditaet,
    crm: crm.data,
    faelle,
    fehler: daten.error ?? crm.error ?? ablage.error ?? erledigt.error,
    laedt: !faelle,
  };
}

/** Prüffall erledigen oder wieder öffnen. */
export function usePruefStatus() {
  const qc = useQueryClient();
  return async (id: string, status: ReviewItem["status"]) => {
    await boardRepository().pruefStatusSetzen(id, status);
    await qc.invalidateQueries({ queryKey: ERLEDIGT_KEY });
  };
}
