import { createFileRoute } from "@tanstack/react-router";

import {
  PERSONAL_REITER,
  PersonalPage,
  type PersonalReiter,
} from "@/features/personal/PersonalPage";

type PersonalSearch = { tab?: PersonalReiter };

export const Route = createFileRoute("/personal")({
  validateSearch: (search: Record<string, unknown>): PersonalSearch => ({
    tab: PERSONAL_REITER.includes(search.tab as PersonalReiter)
      ? (search.tab as PersonalReiter)
      : undefined,
  }),
  head: () => ({ meta: [{ title: "Personal — Grenz & Co." }] }),
  component: function PersonalRoute() {
    const { tab } = Route.useSearch();
    return <PersonalPage reiter={tab ?? "team"} />;
  },
});
