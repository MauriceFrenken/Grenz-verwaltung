import { createFileRoute } from "@tanstack/react-router";

import { MatchingPage } from "@/features/mandate/MatchingPage";

export const Route = createFileRoute("/mandate/$sfId/matching")({
  head: () => ({ meta: [{ title: "Käufer-Matching — Grenz & Co." }] }),
  component: function MatchingRoute() {
    const { sfId } = Route.useParams();
    return <MatchingPage key={sfId} sfId={sfId} />;
  },
});
