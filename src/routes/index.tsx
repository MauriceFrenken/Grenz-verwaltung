import { createFileRoute } from "@tanstack/react-router";
import { CockpitSeite } from "@/modules/cockpit/CockpitSeite";
import { BoardRahmen } from "@/modules/shell/BoardRahmen";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cockpit — FRENKEN" },
      {
        name: "description",
        content:
          "Liquidität, Darlehen, Immobilien, Baumaschinen und offene Prüffälle der FRENKEN Gruppe.",
      },
    ],
  }),
  component: () => (
    <BoardRahmen>
      <CockpitSeite />
    </BoardRahmen>
  ),
});
