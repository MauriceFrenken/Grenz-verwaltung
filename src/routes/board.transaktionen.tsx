import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { TransaktionenSeite } from "@/modules/transaktionen/TransaktionenSeite";

export const Route = createFileRoute("/board/transaktionen")({
  validateSearch: z.object({ ankauf: z.string().optional() }),
  head: () => ({
    meta: [{ title: "Transaktionen — FRENKEN Management Board" }],
  }),
  component: TransaktionenSeite,
});
