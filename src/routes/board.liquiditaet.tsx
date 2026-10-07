import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { LiquiditaetSeite } from "@/modules/liquiditaet/LiquiditaetSeite";

export const Route = createFileRoute("/board/liquiditaet")({
  validateSearch: z.object({ firma: z.string().optional() }),
  head: () => ({ meta: [{ title: "Liquidität — FRENKEN Management Board" }] }),
  component: LiquiditaetSeite,
});
