import { Outlet, createFileRoute } from "@tanstack/react-router";
import { seitenGuard } from "@/lib/permissions";

export const Route = createFileRoute("/transaktionen/expose-import")({
  beforeLoad: seitenGuard("seite.transaktionen.expose_import"),
  component: () => <Outlet />,
});
