import { createFileRoute } from "@tanstack/react-router";
import { PrueflisteSeite } from "@/modules/pruefliste/PrueflisteSeite";

export const Route = createFileRoute("/board/pruefliste")({
  head: () => ({ meta: [{ title: "Prüfliste — FRENKEN Management Board" }] }),
  component: PrueflisteSeite,
});
