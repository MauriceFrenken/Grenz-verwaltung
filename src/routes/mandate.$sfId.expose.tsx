import { createFileRoute } from "@tanstack/react-router";

import { MandatExposePage } from "@/features/mandate/MandatExposePage";

export const Route = createFileRoute("/mandate/$sfId/expose")({
  head: () => ({ meta: [{ title: "Exposé — Grenz & Co." }] }),
  component: function MandatExposeRoute() {
    const { sfId } = Route.useParams();
    return <MandatExposePage key={sfId} sfId={sfId} />;
  },
});
