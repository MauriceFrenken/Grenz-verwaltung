import { createFileRoute } from "@tanstack/react-router";

import { MandatBewertungPage } from "@/features/mandate/MandatBewertungPage";

export const Route = createFileRoute("/mandate/$sfId/bewertung")({
  head: () => ({ meta: [{ title: "Bewertung — Grenz & Co." }] }),
  component: function MandatBewertungRoute() {
    const { sfId } = Route.useParams();
    return <MandatBewertungPage key={sfId} sfId={sfId} />;
  },
});
