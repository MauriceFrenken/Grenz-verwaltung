import { createFileRoute, notFound } from "@tanstack/react-router";

import { KiToolPage } from "@/features/tools/KiToolPage";
import { kiTool } from "@/lib/ki-tools/tools";
import { istDateiTool } from "@/lib/ki-tools/typen";

export const Route = createFileRoute("/tools/$tool")({
  beforeLoad: ({ params }) => {
    if (!kiTool(params.tool) || !istDateiTool(params.tool)) throw notFound();
  },
  head: ({ params }) => ({
    meta: [{ title: `${kiTool(params.tool)?.kurz ?? "Tool"} — Grenz & Co.` }],
  }),
  component: function KiToolRoute() {
    const { tool } = Route.useParams();
    const definition = kiTool(tool);
    if (!definition || !istDateiTool(definition.id)) return null;
    return (
      <KiToolPage
        key={definition.id}
        tool={{ ...definition, id: definition.id }}
      />
    );
  },
});
