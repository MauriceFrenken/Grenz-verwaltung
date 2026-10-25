import { createFileRoute } from "@tanstack/react-router";

import { MandatReportsPage } from "@/features/mandate/MandatReportsPage";

export const Route = createFileRoute("/mandate/$sfId/reports")({
  head: () => ({ meta: [{ title: "Eigentümer-Report — Grenz & Co." }] }),
  component: function MandatReportsPageRoute() {
    const { sfId } = Route.useParams();
    return <MandatReportsPage key={sfId} sfId={sfId} />;
  },
});
