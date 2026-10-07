import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PipelineSeite } from "@/modules/pipeline/PipelineSeite";

export const Route = createFileRoute("/board/pipeline")({
  validateSearch: z.object({ ankauf: z.string().optional() }),
  head: () => ({
    meta: [{ title: "Ankaufspipeline — FRENKEN Management Board" }],
  }),
  component: PipelineSeite,
});
