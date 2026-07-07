import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/verwaltung")({
  component: () => <Outlet />,
});