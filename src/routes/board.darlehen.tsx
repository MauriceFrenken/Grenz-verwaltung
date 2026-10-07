import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { DarlehenSeite } from "@/modules/darlehen/DarlehenSeite";

export const Route = createFileRoute("/board/darlehen")({
  validateSearch: z.object({ darlehen: z.string().optional() }),
  head: () => ({ meta: [{ title: "Darlehen — FRENKEN Management Board" }] }),
  component: DarlehenSeite,
});
