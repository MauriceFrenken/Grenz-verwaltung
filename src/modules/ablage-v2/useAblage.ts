import { useQuery } from "@tanstack/react-query";
import { dokumentKlassifikator } from "@/lib/ai/klassifikation";
import type { BoardDaten } from "@/lib/db/typen";
import { graphPostfach } from "@/lib/integrations/microsoft-graph";
import { ablageVorschlag, kontextAus } from "./logik/ablage";
import { ABLAGE_MAILS } from "./testset";

/** Postfach lesen und jede Mail klassifizieren (Demo: Testset + Mock-KI). */
export function useAblageVorschlaege(daten: BoardDaten | undefined) {
  return useQuery({
    queryKey: ["board", "ablage-v2", daten?.stichtag],
    enabled: Boolean(daten),
    queryFn: async () => {
      const kontext = kontextAus(daten!);
      const mails = await graphPostfach(ABLAGE_MAILS).neueMails();
      const ki = dokumentKlassifikator();
      return Promise.all(
        mails.map(async (m) =>
          ablageVorschlag(m, kontext, await ki.klassifiziere(m, kontext)),
        ),
      );
    },
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
}
