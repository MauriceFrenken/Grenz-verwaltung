import { createFileRoute } from "@tanstack/react-router";

import { MandateListePage } from "@/features/mandate/MandateListePage";

export const Route = createFileRoute("/mandate/")({
  head: () => ({ meta: [{ title: "Mandate — Grenz & Co." }] }),
  component: MandateListePage,
});
