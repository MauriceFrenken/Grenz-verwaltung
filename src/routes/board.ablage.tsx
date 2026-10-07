import { createFileRoute } from "@tanstack/react-router";
import { AblageSeite } from "@/modules/ablage-v2/AblageSeite";

export const Route = createFileRoute("/board/ablage")({
  head: () => ({ meta: [{ title: "Ablage v2 — FRENKEN Management Board" }] }),
  component: AblageSeite,
});
