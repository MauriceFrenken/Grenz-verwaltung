import { createFileRoute } from "@tanstack/react-router";

import { AKQUISE_REITER, AkquiseSeite } from "@/features/akquise/AkquiseSeite";
import { alteAdresseUmleiten } from "@/lib/navigation/alte-adressen";

export const Route = createFileRoute("/akquise/$reiter")({
  beforeLoad: ({ params, location }) => {
    if (!AKQUISE_REITER.some((r) => r.id === params.reiter))
      alteAdresseUmleiten(location);
  },
  head: ({ params }) => ({
    meta: [
      {
        title: `${AKQUISE_REITER.find((r) => r.id === params.reiter)?.label ?? "Akquise"} — Grenz & Co.`,
      },
    ],
  }),
  component: function AkquiseReiterRoute() {
    const { reiter } = Route.useParams();
    const gefunden =
      AKQUISE_REITER.find((r) => r.id === reiter)?.id ?? "uebersicht";
    return <AkquiseSeite reiter={gefunden} />;
  },
});
