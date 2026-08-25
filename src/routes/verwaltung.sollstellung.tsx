import { Outlet, createFileRoute } from "@tanstack/react-router";
import { seitenGuard } from "@/lib/permissions";

export const Route = createFileRoute("/verwaltung/sollstellung")({
  beforeLoad: seitenGuard("seite.verwaltung.sollstellung"),
  head: () => ({ meta: [{ title: "Sollstellung — FRENKEN Verwaltung" }] }),
  component: () => <Outlet />,
});
