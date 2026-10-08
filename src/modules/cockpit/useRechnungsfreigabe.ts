import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { boardRepository } from "@/lib/db/config";

/**
 * Anzahl offener Rechnungsfreigaben aus Bens Postfach (vorher Dashboard-Kachel).
 * null im Demo-Modus, ohne Anmeldung oder bei Fehler.
 */
export function useRechnungsfreigabeOffen(): number | null {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const live = boardRepository().quelle === "live";
  const { data } = useQuery({
    queryKey: ["cockpit", "rechnungsfreigabe-offen"],
    enabled: live && !!token,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      const { dokumentRechnungsfreigabeZaehlenFn } =
        await import("@/lib/dokument-postfach/server-fn");
      const { offen } = await dokumentRechnungsfreigabeZaehlenFn({
        data: { supabaseAccessToken: token },
      });
      return offen;
    },
  });
  return data ?? null;
}
