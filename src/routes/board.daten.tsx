import { createFileRoute } from "@tanstack/react-router";
import { DatenSeite } from "@/modules/daten/DatenSeite";

export const Route = createFileRoute("/board/daten")({
  head: () => ({
    meta: [{ title: "Datenqualität — FRENKEN Management Board" }],
  }),
  component: DatenSeite,
});
