import { Outlet, createFileRoute } from "@tanstack/react-router";
import { seitenGuard } from "@/lib/permissions";

export interface ObjekteSuche {
  gesellschaft?: string;
}

/** Filter liegt auf der Elternroute, damit die Detailseite zurück in die gefilterte Liste verlinken kann. */
export const Route = createFileRoute("/verwaltung/objekte")({
  beforeLoad: seitenGuard("seite.verwaltung.objekte"),
  validateSearch: (search: Record<string, unknown>): ObjekteSuche => ({
    gesellschaft:
      typeof search.gesellschaft === "string" ? search.gesellschaft : undefined,
  }),
  head: () => ({ meta: [{ title: "Objekte — FRENKEN Verwaltung" }] }),
  component: () => <Outlet />,
});
