import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AufteilerSeite } from "@/modules/aufteiler/AufteilerSeite";

export const Route = createFileRoute("/board/aufteiler")({
  validateSearch: z.object({
    projekt: z.string().optional(),
  }),
  head: () => ({
    meta: [{ title: "Aufteilerprojekte — Grenz & Co. Management Board" }],
  }),
  component: AufteilerSeite,
});
