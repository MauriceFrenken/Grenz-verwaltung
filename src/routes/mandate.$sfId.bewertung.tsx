import { createFileRoute } from "@tanstack/react-router";

import { BewertungPage } from "@/features/mandate/BewertungPage";

export const Route = createFileRoute("/mandate/$sfId/bewertung")({
  head: () => ({ meta: [{ title: "Indikative Bewertung — Grenz & Co." }] }),
  component: function BewertungRoute() {
    const { sfId } = Route.useParams();
    return <BewertungPage key={sfId} sfId={sfId} />;
  },
});
