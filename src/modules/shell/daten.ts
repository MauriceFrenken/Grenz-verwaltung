import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { boardRepository } from "@/lib/db/config";
import type { BoardDaten } from "@/lib/db/typen";
import { useBoardUi } from "./store";

export const BOARD_DATEN_KEY = ["board", "daten"] as const;

/** Lädt den Board-Datenbestand über das konfigurierte Repository. */
export function useBoardDaten() {
  return useQuery({
    queryKey: BOARD_DATEN_KEY,
    queryFn: () => boardRepository().laden(),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
}

/** Aktiver Gesellschaftsfilter als Prädikat. */
export function useGesellschaftsFilter() {
  const gesellschaft = useBoardUi((s) => s.gesellschaft);
  return useMemo(
    () => ({
      gesellschaft,
      alle: gesellschaft === "alle",
      passt: (companyId: string | null | undefined) =>
        gesellschaft === "alle" || companyId === gesellschaft,
    }),
    [gesellschaft],
  );
}

/** Nachschlage-Tabellen für Namen. */
export function useNachschlagen(daten: BoardDaten | undefined) {
  return useMemo(() => {
    const companies = new Map(daten?.companies.map((c) => [c.id, c]) ?? []);
    const parties = new Map(daten?.parties.map((p) => [p.id, p]) ?? []);
    const properties = new Map(daten?.properties.map((p) => [p.id, p]) ?? []);
    const units = new Map(daten?.units.map((u) => [u.id, u]) ?? []);
    const tenants = new Map(daten?.tenants.map((t) => [t.id, t]) ?? []);
    return {
      companies,
      parties,
      properties,
      units,
      tenants,
      gesellschaftName: (id: string | null | undefined) =>
        (id && companies.get(id)?.name) || "–",
      gesellschaftKurz: (id: string | null | undefined) =>
        (id && companies.get(id)?.shortName) || "–",
      parteiName: (companyId: string | null, partyId: string | null) =>
        (companyId && companies.get(companyId)?.name) ||
        (partyId && parties.get(partyId)?.name) ||
        "–",
    };
  }, [daten]);
}
