import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { apiFehlermeldung } from "@/lib/apiFehlermeldung";
import type {
  RecruitingAktion,
  RecruitingDto,
} from "@/lib/personal/recruiting";

/** Lädt Stellen und Bewerber (nur für Personalverantwortliche) und führt Aktionen aus. */
export function useRecruiting(token: string, aktiv: boolean) {
  const [daten, setDaten] = useState<RecruitingDto | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const laden = useCallback(async () => {
    if (!token || !aktiv) return;
    try {
      const { recruitingLadenFn } =
        await import("@/lib/personal/recruiting-server-fn");
      setDaten(
        await recruitingLadenFn({ data: { supabaseAccessToken: token } }),
      );
      setFehler(null);
    } catch (err) {
      setFehler(apiFehlermeldung(err));
    }
  }, [token, aktiv]);

  useEffect(() => {
    void laden();
  }, [laden]);

  const ausfuehren = useCallback(
    async (
      aktion: RecruitingAktion,
      erfolg?: string,
    ): Promise<{ ok: boolean; id?: string }> => {
      try {
        const { recruitingAktionFn } =
          await import("@/lib/personal/recruiting-server-fn");
        const r = await recruitingAktionFn({
          data: { supabaseAccessToken: token, aktion },
        });
        if (erfolg) toast.success(erfolg);
        await laden();
        return { ok: true, id: r.id };
      } catch (err) {
        toast.error(apiFehlermeldung(err));
        return { ok: false };
      }
    },
    [token, laden],
  );

  return { daten, fehler, token, neuLaden: laden, ausfuehren, setDaten };
}

export type RecruitingKontext = ReturnType<typeof useRecruiting>;
