import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/useAuth";
import { apiFehlermeldung } from "@/lib/apiFehlermeldung";
import type { PersonalAktion, PersonalDto } from "@/lib/personal/typen";

/** Lädt den Personalbereich eines Jahres und führt Aktionen mit anschließendem Neuladen aus. */
export function usePersonal(jahr: number) {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const [daten, setDaten] = useState<PersonalDto | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(false);

  const laden = useCallback(async () => {
    if (!token) return;
    setLaedt(true);
    try {
      const { personalLadenFn } = await import("@/lib/personal/server-fn");
      setDaten(
        await personalLadenFn({ data: { supabaseAccessToken: token, jahr } }),
      );
      setFehler(null);
    } catch (err) {
      setFehler(apiFehlermeldung(err));
    } finally {
      setLaedt(false);
    }
  }, [token, jahr]);

  useEffect(() => {
    void laden();
  }, [laden]);

  const ausfuehren = useCallback(
    async (aktion: PersonalAktion, erfolg?: string): Promise<boolean> => {
      try {
        const { personalAktionFn } = await import("@/lib/personal/server-fn");
        await personalAktionFn({
          data: { supabaseAccessToken: token, aktion },
        });
        if (erfolg) toast.success(erfolg);
        await laden();
        return true;
      } catch (err) {
        toast.error(apiFehlermeldung(err));
        return false;
      }
    },
    [token, laden],
  );

  return { daten, fehler, laedt, token, neuLaden: laden, ausfuehren };
}

export type PersonalKontext = ReturnType<typeof usePersonal> & {
  daten: PersonalDto;
};
