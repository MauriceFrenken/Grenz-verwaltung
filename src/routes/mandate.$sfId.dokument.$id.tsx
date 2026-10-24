import { createFileRoute } from "@tanstack/react-router";

import { ExposeEditorPage } from "@/features/mandate/ExposeEditorPage";

export const Route = createFileRoute("/mandate/$sfId/dokument/$id")({
  head: () => ({ meta: [{ title: "Exposé — Grenz & Co." }] }),
  component: function DokumentRoute() {
    const { sfId, id } = Route.useParams();
    return <ExposeEditorPage key={id} sfId={sfId} id={id} />;
  },
});
