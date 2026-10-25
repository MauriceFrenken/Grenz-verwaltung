import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/useAuth";
import { apiFehlermeldung } from "@/lib/apiFehlermeldung";
import type { AkquiseDto } from "@/lib/akquise/typen";
import { SALESFORCE_LIGHTNING_URL } from "@/lib/salesforce/config";

/** Gemeinsamer Stand für alle Akquise-Seiten, damit ein Reiterwechsel nicht neu lädt. */
let geladen: AkquiseDto | null = null;

export function useAkquiseDaten() {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const [daten, setDaten] = useState<AkquiseDto | null>(geladen);
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const laden = useCallback(
    async (neu: boolean) => {
      if (!token) return;
      setLaedt(true);
      setFehler(null);
      try {
        const { akquiseLadenFn } = await import("@/lib/akquise/server-fn");
        const d = await akquiseLadenFn({
          data: { supabaseAccessToken: token, neu },
        });
        geladen = d;
        setDaten(d);
      } catch (err) {
        const text = apiFehlermeldung(err);
        setFehler(text);
        if (neu) toast.error(text);
      } finally {
        setLaedt(false);
      }
    },
    [token],
  );

  useEffect(() => {
    if (!geladen) void laden(false);
  }, [laden]);

  return { daten, laedt, fehler, neuLaden: () => laden(true) };
}

/** Link auf einen Datensatz in Salesforce Lightning. */
export function sfLink(typ: string, id: string): string {
  return `${SALESFORCE_LIGHTNING_URL}/lightning/r/${typ}/${id}/view`;
}
