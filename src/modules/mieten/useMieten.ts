import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";
import { konfigurierteDatenquelle } from "@/lib/db/config";
import {
  eingangEntscheiden,
  eingangFreigeben,
  eingangZuordnen,
  mietenAktualisieren,
  mietenLaden,
  zahlungenLaden,
  type AbgleichErgebnis,
} from "@/lib/db/mieten";
import { heuteIso } from "@/lib/kalender";
import { supabase } from "@/lib/supabase";
import { BOARD_DATEN_KEY, useBoardDaten } from "@/modules/shell/daten";
import { mietenDemo } from "./logik/mieten";

export const MIETEN_KEY = ["board", "mieten"] as const;

const istLive = () => konfigurierteDatenquelle() === "live";

/** Mietkonten und offene Eingänge; im Demo-Modus aus den Musterdaten. */
export function useMieten() {
  const board = useBoardDaten();
  const demo = useMemo(
    () => (!istLive() && board.data ? mietenDemo(board.data) : null),
    [board.data],
  );
  return useQuery({
    queryKey: [...MIETEN_KEY, demo ? "demo" : "live"],
    enabled: istLive() || Boolean(demo),
    queryFn: async () =>
      demo ? demo.daten : await mietenLaden(supabase, heuteIso()),
    staleTime: 60_000,
  });
}

/** Zahlungen eines Mietvertrags (Detail). */
export function useMietzahlungen(leaseId: string | null) {
  const board = useBoardDaten();
  return useQuery({
    queryKey: [...MIETEN_KEY, "zahlungen", leaseId],
    enabled: Boolean(leaseId) && (istLive() || Boolean(board.data)),
    queryFn: async () => {
      if (!leaseId) return [];
      if (!istLive())
        return mietenDemo(board.data!)
          .zahlungen.filter((z) => z.leaseId === leaseId)
          .reverse();
      return zahlungenLaden(supabase, leaseId);
    },
  });
}

function zusammenfassung(e: AbgleichErgebnis | void): string | undefined {
  if (!e) return undefined;
  const n = (e.iban ?? 0) + (e.zahler ?? 0) + (e.name ?? 0);
  return n > 0
    ? `${n} weitere Zahlung${n === 1 ? "" : "en"} automatisch zugeordnet`
    : undefined;
}

/** Aktionen am Mietkonto; nach jeder Aktion werden Mieten und Board neu geladen. */
export function useMietenAktionen() {
  const qc = useQueryClient();
  const neuLaden = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: MIETEN_KEY }),
      qc.invalidateQueries({ queryKey: BOARD_DATEN_KEY }),
    ]);
  };
  const ausfuehren = async <T>(
    erfolg: string,
    aktion: () => Promise<T>,
    beschreibung?: (r: T) => string | undefined,
  ): Promise<boolean> => {
    if (!istLive()) {
      toast.info("Im Demo-Modus werden keine Daten geändert.");
      return false;
    }
    try {
      const r = await aktion();
      await neuLaden();
      toast.success(erfolg, { description: beschreibung?.(r) });
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    }
  };

  return {
    abgleichen: () =>
      ausfuehren(
        "Mietkonten aktualisiert",
        () => mietenAktualisieren(supabase),
        (r) => zusammenfassung(r) ?? "Keine neuen Zuordnungen",
      ),
    zuordnen: (bankbuchungId: string, leaseIds: string[], merken: boolean) =>
      ausfuehren(
        "Zahlung zugeordnet",
        () => eingangZuordnen(supabase, bankbuchungId, leaseIds, merken),
        zusammenfassung,
      ),
    keineMiete: (bankbuchungId: string, zahlerMerken: boolean) =>
      ausfuehren(
        zahlerMerken
          ? "Zahler wird künftig übergangen"
          : "Als keine Miete markiert",
        () =>
          eingangEntscheiden(supabase, bankbuchungId, "keine_miete", {
            zahlerMerken,
          }),
      ),
    loesen: (bankbuchungId: string) =>
      ausfuehren(
        "Zuordnung gelöst, Zahlung steht in den offenen Eingängen",
        () =>
          eingangEntscheiden(supabase, bankbuchungId, "pruefen", {
            grund: "Zuordnung von Hand gelöst",
          }),
      ),
    freigeben: (bankbuchungId: string) =>
      ausfuehren(
        "Zahlung wieder zur Automatik freigegeben",
        () => eingangFreigeben(supabase, bankbuchungId),
        zusammenfassung,
      ),
  };
}
