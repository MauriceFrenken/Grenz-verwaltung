import { createFileRoute } from "@tanstack/react-router";
import { ObjektDetailTeaser } from "@/features/teaser";
import { seitenGuard } from "@/lib/permissions";

export const Route = createFileRoute("/verwaltung/objekte/$id")({
  beforeLoad: seitenGuard("seite.verwaltung.objekte"),
  component: RouteComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();
  return <ObjektDetailTeaser id={id} />;
}