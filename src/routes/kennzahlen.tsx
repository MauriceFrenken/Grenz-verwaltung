import { createFileRoute } from "@tanstack/react-router";

import {
  KENNZAHLEN_REITER,
  KennzahlenSeite,
  type KennzahlenReiter,
} from "@/features/kennzahlen/KennzahlenSeite";

type KennzahlenSearch = { tab?: KennzahlenReiter };

export const Route = createFileRoute("/kennzahlen")({
  validateSearch: (search: Record<string, unknown>): KennzahlenSearch => ({
    tab: KENNZAHLEN_REITER.find((r) => r.id === search.tab)?.id,
  }),
  head: () => ({ meta: [{ title: "Kennzahlen — Grenz & Co." }] }),
  component: function KennzahlenRoute() {
    const { tab } = Route.useSearch();
    return <KennzahlenSeite reiter={tab ?? "wachstum"} />;
  },
});
