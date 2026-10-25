import { createFileRoute } from "@tanstack/react-router";

import {
  VerkaeuferPage,
  type VerkaeuferReiter,
} from "@/features/markt-radar/VerkaeuferPage";

type VerkaeuferSearch = { tab?: VerkaeuferReiter };

export const Route = createFileRoute("/verkaeufer")({
  validateSearch: (search: Record<string, unknown>): VerkaeuferSearch => ({
    tab: search.tab === "salesforce" ? "salesforce" : undefined,
  }),
  head: () => ({ meta: [{ title: "Verkäufer — Grenz & Co." }] }),
  component: function VerkaeuferRoute() {
    const { tab } = Route.useSearch();
    return <VerkaeuferPage reiter={tab ?? "markt"} />;
  },
});
