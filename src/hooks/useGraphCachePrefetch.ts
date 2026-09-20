import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import { prefetchGraphListen } from "@/lib/graph-cache";

/** Nach Login: Graph-Listen idle im Hintergrund vorladen. */
export function useGraphCachePrefetch() {
  const queryClient = useQueryClient();
  const { session, benutzer, istAngemeldet } = useAuth();
  const gestartetRef = useRef(false);

  useEffect(() => {
    if (!istAngemeldet) {
      gestartetRef.current = false;
      return;
    }

    const token = session?.access_token;
    const userId = benutzer?.id;
    if (!token || !userId || gestartetRef.current) return;
    gestartetRef.current = true;

    const idle =
      typeof requestIdleCallback === "function"
        ? requestIdleCallback
        : (cb: () => void) => window.setTimeout(cb, 400);

    const cancelIdle =
      typeof cancelIdleCallback === "function"
        ? cancelIdleCallback
        : (id: number) => window.clearTimeout(id);

    const handle = idle(() => {
      prefetchGraphListen(queryClient, token, userId);
    });

    return () => {
      cancelIdle(handle as number);
    };
  }, [istAngemeldet, session?.access_token, benutzer?.id, queryClient]);
}
