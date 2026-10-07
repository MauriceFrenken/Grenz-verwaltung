import { createFileRoute } from "@tanstack/react-router";
import { LiquiditaetSeite } from "@/modules/liquiditaet/LiquiditaetSeite";

export const Route = createFileRoute("/board/liquiditaet")({
  head: () => ({ meta: [{ title: "Liquidität — FRENKEN Management Board" }] }),
  component: LiquiditaetSeite,
});
