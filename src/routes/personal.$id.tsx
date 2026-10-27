import { createFileRoute } from "@tanstack/react-router";

import {
  PROFIL_REITER,
  ProfilPage,
  type ProfilReiter,
} from "@/features/personal/ProfilPage";

type ProfilSearch = { tab?: ProfilReiter };

export const Route = createFileRoute("/personal/$id")({
  validateSearch: (search: Record<string, unknown>): ProfilSearch => ({
    tab: PROFIL_REITER.includes(search.tab as ProfilReiter)
      ? (search.tab as ProfilReiter)
      : undefined,
  }),
  head: () => ({ meta: [{ title: "Mitarbeiterprofil — Grenz & Co." }] }),
  component: function ProfilRoute() {
    const { id } = Route.useParams();
    const { tab } = Route.useSearch();
    return <ProfilPage id={id} reiter={tab ?? "persoenlich"} />;
  },
});
