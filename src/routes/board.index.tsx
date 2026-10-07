import { createFileRoute } from "@tanstack/react-router";
import { CockpitSeite } from "@/modules/cockpit/CockpitSeite";

export const Route = createFileRoute("/board/")({
  head: () => ({ meta: [{ title: "Cockpit — FRENKEN Management Board" }] }),
  component: CockpitSeite,
});
