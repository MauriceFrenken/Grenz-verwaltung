import { createFileRoute } from "@tanstack/react-router";

import { ReportEditorPage } from "@/features/mandate/ReportEditorPage";

export const Route = createFileRoute("/mandate/$sfId/report/$id")({
  head: () => ({ meta: [{ title: "Vermarktungsbericht — Grenz & Co." }] }),
  component: function ReportRoute() {
    const { sfId, id } = Route.useParams();
    return <ReportEditorPage key={id} sfId={sfId} id={id} />;
  },
});
