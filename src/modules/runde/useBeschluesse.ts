import { useQuery, useQueryClient } from "@tanstack/react-query";
import { boardRepository } from "@/lib/db/config";
import type { BeschlussEingabe } from "@/lib/db/repository";
import type { Beschluss } from "@/lib/db/typen";

export const BESCHLUESSE_KEY = ["board", "beschluesse"] as const;

export function useBeschluesse() {
  return useQuery({
    queryKey: BESCHLUESSE_KEY,
    queryFn: () => boardRepository().beschluesse(),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/** Beschluss anlegen bzw. Status setzen, danach neu laden. */
export function useBeschlussAktionen() {
  const qc = useQueryClient();
  const neu = () => qc.invalidateQueries({ queryKey: BESCHLUESSE_KEY });
  return {
    anlegen: async (e: BeschlussEingabe) => {
      const id = await boardRepository().beschlussAnlegen(e);
      await neu();
      return id;
    },
    status: async (id: string, status: Beschluss["status"], am: string) => {
      await boardRepository().beschlussStatusSetzen(id, status, am);
      await neu();
    },
  };
}
