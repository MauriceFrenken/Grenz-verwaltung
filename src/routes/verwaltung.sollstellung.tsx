import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/verwaltung/sollstellung")({
  head: () => ({ meta: [{ title: "Sollstellung — Grenz & Co. Verwaltung" }] }),
  component: () => <Outlet />,
});
