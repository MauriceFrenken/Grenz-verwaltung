import { createFileRoute } from "@tanstack/react-router";
import { RundeSeite } from "@/modules/runde/RundeSeite";

export const Route = createFileRoute("/board/runde")({
  head: () => ({
    meta: [{ title: "Wochenrunde — FRENKEN Management Board" }],
  }),
  component: RundeSeite,
});
