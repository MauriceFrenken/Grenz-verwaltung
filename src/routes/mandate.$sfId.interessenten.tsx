import { createFileRoute } from "@tanstack/react-router";

import { MandatInteressentenPage } from "@/features/mandate/MandatInteressentenPage";

export const Route = createFileRoute("/mandate/$sfId/interessenten")({
  head: () => ({ meta: [{ title: "Interessenten — Grenz & Co." }] }),
  component: function MandatInteressentenPageRoute() {
    const { sfId } = Route.useParams();
    return <MandatInteressentenPage key={sfId} sfId={sfId} />;
  },
});
