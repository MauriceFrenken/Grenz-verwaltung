import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/verwaltung/sollstellung")({
  head: () => ({ meta: [{ title: "Sollstellung — FRENKEN Verwaltung" }] }),
  component: () => <Outlet />,
});
