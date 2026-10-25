import { createFileRoute } from "@tanstack/react-router";

import { ToolsUebersichtPage } from "@/features/tools/ToolsUebersichtPage";

export const Route = createFileRoute("/tools/")({
  head: () => ({ meta: [{ title: "Tools — Grenz & Co." }] }),
  component: ToolsUebersichtPage,
});
