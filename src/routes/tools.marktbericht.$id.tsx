import { createFileRoute } from "@tanstack/react-router";

import { MarktberichtEditorPage } from "@/features/marktbericht/MarktberichtEditorPage";

export const Route = createFileRoute("/tools/marktbericht/$id")({
  head: () => ({ meta: [{ title: "Marktbericht — Grenz & Co." }] }),
  component: function MarktberichtRoute() {
    const { id } = Route.useParams();
    return <MarktberichtEditorPage key={id} id={id} />;
  },
});
