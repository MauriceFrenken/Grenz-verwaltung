import { createFileRoute } from "@tanstack/react-router";

import {
  INVESTOREN_REITER,
  InvestorenPage,
  type InvestorenReiter,
} from "@/features/markt-radar/InvestorenPage";

type InvestorenSearch = { tab?: InvestorenReiter };

export const Route = createFileRoute("/investoren")({
  validateSearch: (search: Record<string, unknown>): InvestorenSearch => ({
    tab: INVESTOREN_REITER.includes(search.tab as InvestorenReiter)
      ? (search.tab as InvestorenReiter)
      : undefined,
  }),
  head: () => ({ meta: [{ title: "Investoren — Grenz & Co." }] }),
  component: function InvestorenRoute() {
    const { tab } = Route.useSearch();
    return <InvestorenPage reiter={tab ?? "datenbank"} />;
  },
});
