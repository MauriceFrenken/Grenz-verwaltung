import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { BaumaschinenSeite } from "@/modules/baumaschinen/BaumaschinenSeite";

export const Route = createFileRoute("/board/baumaschinen")({
  validateSearch: z.object({ maschine: z.string().optional() }),
  head: () => ({
    meta: [{ title: "Baumaschinen — FRENKEN Management Board" }],
  }),
  component: BaumaschinenSeite,
});
