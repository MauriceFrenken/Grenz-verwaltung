import { createFileRoute } from "@tanstack/react-router";

import { MandatExposesPage } from "@/features/mandate/MandatExposesPage";

export const Route = createFileRoute("/mandate/$sfId/exposes")({
  head: () => ({ meta: [{ title: "Exposé & Teaser — Grenz & Co." }] }),
  component: function MandatExposesPageRoute() {
    const { sfId } = Route.useParams();
    return <MandatExposesPage key={sfId} sfId={sfId} />;
  },
});
