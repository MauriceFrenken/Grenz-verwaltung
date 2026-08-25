import { createFileRoute } from "@tanstack/react-router";
import { SollstellungDetailPage } from "@/features/verwaltung/SollstellungDetailPage";

export const Route = createFileRoute("/verwaltung/sollstellung/$id")({
  head: () => ({ meta: [{ title: "Sollstellung — FRENKEN Verwaltung" }] }),
  component: RouteComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();
  return <SollstellungDetailPage id={id} />;
}
