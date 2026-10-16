import { createFileRoute } from "@tanstack/react-router";
import { RundeSeite } from "@/modules/runde/RundeSeite";

export const Route = createFileRoute("/board/runde")({
  head: () => ({
    meta: [{ title: "Wochenrunde — Grenz & Co. Management Board" }],
  }),
  component: RundeSeite,
});
