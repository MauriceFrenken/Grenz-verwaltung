import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ImmobilienSeite } from "@/modules/immobilien/ImmobilienSeite";

export const Route = createFileRoute("/board/immobilien")({
  validateSearch: z.object({
    objekt: z.string().optional(),
    mietvertrag: z.string().optional(),
  }),
  head: () => ({ meta: [{ title: "Immobilien — Grenz & Co. Management Board" }] }),
  component: ImmobilienSeite,
});
