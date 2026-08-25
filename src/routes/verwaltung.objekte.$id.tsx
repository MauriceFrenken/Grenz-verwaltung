import { createFileRoute } from "@tanstack/react-router";
import { ObjektDetailPage } from "@/features/verwaltung/ObjektDetailPage";

export const Route = createFileRoute("/verwaltung/objekte/$id")({
  head: () => ({ meta: [{ title: "Objekt — FRENKEN Verwaltung" }] }),
  component: RouteComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();
  return <ObjektDetailPage id={id} />;
}
