import { toast } from "sonner";

import type { QueryClient } from "@tanstack/react-query";

import type { GraphDriveItem } from "@/lib/microsoft/graph";
import type {
  DokumentPosteingangSyncErgebnis,
  DokumentRechnungsfreigabe,
} from "@/lib/dokument-postfach/typen";
import type { PostfachSyncErgebnis } from "@/lib/postfach/typen";

import { graphKeys } from "./keys";

export async function holeAblageKinder(
  token: string,
  itemId: string | null,
  frisch = false,
): Promise<{ items: GraphDriveItem[] }> {
  const { microsoftOneDriveKinderFn } = await import("@/lib/microsoft/server-fn");
  return microsoftOneDriveKinderFn({
    data: {
      supabaseAccessToken: token,
      itemId,
      frisch,
    },
  });
}

/**
 * DB zuerst (schnell), dann Graph-Sync.
 * `onDbSnapshot` schreibt Zwischenergebnis in den Query-Cache,
 * damit die UI nicht auf den Sync warten muss.
 */
export async function holeDokumentPosteingang(
  token: string,
  onDbSnapshot?: (daten: DokumentPosteingangSyncErgebnis) => void,
): Promise<DokumentPosteingangSyncErgebnis> {
  const { dokumentPosteingangLadenFn, dokumentPosteingangSyncFn } = await import(
    "@/lib/dokument-postfach/server-fn"
  );

  const erst = await dokumentPosteingangLadenFn({
    data: { supabaseAccessToken: token },
  });
  onDbSnapshot?.(erst);

  try {
    return await dokumentPosteingangSyncFn({
      data: { supabaseAccessToken: token, maxAnalysen: 0 },
    });
  } catch (e) {
    toast.error(
      e instanceof Error
        ? e.message
        : "Postfach-Aktualisierung fehlgeschlagen.",
      { duration: 8_000 },
    );
    return erst;
  }
}

export async function holeExposePostfach(
  token: string,
  onDbSnapshot?: (daten: PostfachSyncErgebnis) => void,
): Promise<PostfachSyncErgebnis> {
  const { postfachLadenFn, postfachSyncFn } = await import(
    "@/lib/postfach/server-fn"
  );

  const erst = await postfachLadenFn({
    data: { supabaseAccessToken: token },
  });
  onDbSnapshot?.(erst);

  try {
    return await postfachSyncFn({
      data: { supabaseAccessToken: token, maxAnalysen: 0 },
    });
  } catch (e) {
    toast.error(
      e instanceof Error
        ? e.message
        : "Exposé-Postfach konnte nicht aktualisiert werden.",
      { duration: 8_000 },
    );
    return erst;
  }
}

export async function holeRechnungsfreigabe(
  token: string,
): Promise<DokumentRechnungsfreigabe> {
  const { dokumentRechnungsfreigabeLadenFn } = await import(
    "@/lib/dokument-postfach/server-fn"
  );
  return dokumentRechnungsfreigabeLadenFn({
    data: { supabaseAccessToken: token },
  });
}

/** Prefetch ohne UI — für Idle/Hover. */
export function prefetchGraphListen(
  queryClient: QueryClient,
  token: string,
  userId: string,
): void {
  if (!token || !userId) return;

  void queryClient.prefetchQuery({
    queryKey: graphKeys.ablage(userId, null),
    queryFn: () => holeAblageKinder(token, null),
  });

  void queryClient.prefetchQuery({
    queryKey: graphKeys.dokumentPosteingang(userId),
    queryFn: () =>
      holeDokumentPosteingang(token, (snap) => {
        queryClient.setQueryData(graphKeys.dokumentPosteingang(userId), snap);
      }),
  });

  void queryClient.prefetchQuery({
    queryKey: graphKeys.exposePostfach(userId),
    queryFn: () =>
      holeExposePostfach(token, (snap) => {
        queryClient.setQueryData(graphKeys.exposePostfach(userId), snap);
      }),
  });

  void queryClient.prefetchQuery({
    queryKey: graphKeys.rechnungsfreigabe(userId),
    queryFn: () => holeRechnungsfreigabe(token),
  });
}

export function prefetchGraphRoute(
  queryClient: QueryClient,
  token: string,
  userId: string,
  pathname: string,
): void {
  if (!token || !userId) return;

  if (pathname.startsWith("/dokumente/ablage")) {
    void queryClient.prefetchQuery({
      queryKey: graphKeys.ablage(userId, null),
      queryFn: () => holeAblageKinder(token, null),
    });
    return;
  }
  if (pathname.startsWith("/dokumente/pruefordner")) {
    void queryClient.prefetchQuery({
      queryKey: graphKeys.dokumentPosteingang(userId),
      queryFn: () =>
        holeDokumentPosteingang(token, (snap) => {
          queryClient.setQueryData(graphKeys.dokumentPosteingang(userId), snap);
        }),
    });
    return;
  }
  if (pathname.startsWith("/dokumente/rechnungsfreigabe")) {
    void queryClient.prefetchQuery({
      queryKey: graphKeys.rechnungsfreigabe(userId),
      queryFn: () => holeRechnungsfreigabe(token),
    });
    return;
  }
  if (pathname.startsWith("/transaktionen/liste")) {
    void queryClient.prefetchQuery({
      queryKey: graphKeys.exposePostfach(userId),
      queryFn: () =>
        holeExposePostfach(token, (snap) => {
          queryClient.setQueryData(graphKeys.exposePostfach(userId), snap);
        }),
    });
  }
}
