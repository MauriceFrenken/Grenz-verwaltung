import { createFileRoute } from "@tanstack/react-router";

import {
  ALTE_REITER,
  PERSONAL_REITER,
  PersonalPage,
  type PersonalReiter,
} from "@/features/personal/PersonalPage";

type PersonalSearch = { tab?: PersonalReiter };

export const Route = createFileRoute("/personal/")({
  validateSearch: (search: Record<string, unknown>): PersonalSearch => {
    const tab = String(search.tab ?? "");
    return {
      tab: PERSONAL_REITER.includes(tab as PersonalReiter)
        ? (tab as PersonalReiter)
        : ALTE_REITER[tab],
    };
  },
  head: () => ({ meta: [{ title: "Personal — Grenz & Co." }] }),
  component: function PersonalRoute() {
    const { tab } = Route.useSearch();
    return <PersonalPage reiter={tab ?? "uebersicht"} />;
  },
});
