import { createFileRoute } from "@tanstack/react-router";

import { MandatDetailPage } from "@/features/mandate/MandatDetailPage";

export const Route = createFileRoute("/mandate/$sfId/")({
  head: () => ({ meta: [{ title: "Mandat — Grenz & Co." }] }),
  component: function MandatRoute() {
    const { sfId } = Route.useParams();
    return <MandatDetailPage key={sfId} sfId={sfId} />;
  },
});
