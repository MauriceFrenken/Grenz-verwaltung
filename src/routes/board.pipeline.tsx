import { createFileRoute } from "@tanstack/react-router";
import { PipelineSeite } from "@/modules/pipeline/PipelineSeite";

export const Route = createFileRoute("/board/pipeline")({
  head: () => ({
    meta: [{ title: "Ankaufspipeline — FRENKEN Management Board" }],
  }),
  component: PipelineSeite,
});
