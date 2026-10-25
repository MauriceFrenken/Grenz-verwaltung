import { createFileRoute } from "@tanstack/react-router";

import {
  InvestorenPage,
  type InvestorenReiter,
} from "@/features/markt-radar/InvestorenPage";

type InvestorenSearch = { tab?: InvestorenReiter };

export const Route = createFileRoute("/investoren")({
  validateSearch: (search: Record<string, unknown>): InvestorenSearch => ({
    tab: search.tab === "profile" ? "profile" : undefined,
  }),
  head: () => ({ meta: [{ title: "Investoren — Grenz & Co." }] }),
  component: function InvestorenRoute() {
    const { tab } = Route.useSearch();
    return <InvestorenPage reiter={tab ?? "markt"} />;
  },
});
