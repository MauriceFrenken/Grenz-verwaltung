import { useQuery } from "@tanstack/react-query";
import type { BoardDaten } from "@/lib/db/typen";
import { salesforceAdapter } from "@/lib/integrations/salesforce";

export const CRM_KEY = ["board", "crm"] as const;

/** CRM-Daten (Ankäufe, Käufer, Reservierungen) über den Salesforce-Adapter. */
export function useCrmDaten(daten: BoardDaten | undefined) {
  return useQuery({
    queryKey: CRM_KEY,
    enabled: Boolean(daten),
    queryFn: () => salesforceAdapter(daten!).laden(),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
}
