import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/useAuth";
import type { MandatDetail } from "@/lib/mandate/server-fn";

export function tagVor(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

/** Lädt ein Mandat für einen Zeitraum; geteilt von den Reitern der Mandatsakte. */
export function useMandatDetail(sfId: string) {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const [von, setVon] = useState(tagVor(30));
  const [bis, setBis] = useState(tagVor(0));
  const [detail, setDetail] = useState<MandatDetail | null>(null);

  const laden = useCallback(async () => {
    if (!token) return;
    try {
      const { mandatDetailFn } = await import("@/lib/mandate/server-fn");
      setDetail(
        await mandatDetailFn({
          data: { supabaseAccessToken: token, sfId, von, bis },
        }),
      );
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Mandat konnte nicht geladen werden.",
      );
    }
  }, [token, sfId, von, bis]);

  useEffect(() => {
    void laden();
  }, [laden]);

  return { token, detail, von, setVon, bis, setBis, neuLaden: laden };
}

export function mandatTitel(detail: MandatDetail | null): string {
  const m = detail?.mandat;
  return m ? (m.objekt ?? m.name) : "Mandat";
}

export function mandatBeschreibung(
  detail: MandatDetail | null,
): string | undefined {
  const m = detail?.mandat;
  return m
    ? [m.name, m.adresse, m.status].filter(Boolean).join(" · ")
    : undefined;
}
