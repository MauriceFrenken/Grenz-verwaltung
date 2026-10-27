import { createFileRoute } from "@tanstack/react-router";

import { PipelineSeite } from "@/features/pipeline/PipelineSeite";

export const Route = createFileRoute("/pipeline")({
  head: () => ({ meta: [{ title: "Deal-Pipeline — Grenz & Co." }] }),
  component: PipelineSeite,
});
