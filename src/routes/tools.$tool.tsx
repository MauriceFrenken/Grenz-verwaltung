import { createFileRoute, notFound } from "@tanstack/react-router";

import { KiToolPage } from "@/features/tools/KiToolPage";
import { kiTool } from "@/lib/ki-tools/tools";

export const Route = createFileRoute("/tools/$tool")({
  beforeLoad: ({ params }) => {
    if (!kiTool(params.tool)) throw notFound();
  },
  head: ({ params }) => ({
    meta: [{ title: `${kiTool(params.tool)?.kurz ?? "Tool"} — Grenz & Co.` }],
  }),
  component: function KiToolRoute() {
    const { tool } = Route.useParams();
    const definition = kiTool(tool)!;
    return <KiToolPage key={definition.id} tool={definition} />;
  },
});
