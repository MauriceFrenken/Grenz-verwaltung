import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { GRAPH_GC_MS, GRAPH_STALE_MS } from "@/lib/graph-cache";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: GRAPH_STALE_MS,
        gcTime: GRAPH_GC_MS,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: GRAPH_STALE_MS,
  });

  return router;
};
