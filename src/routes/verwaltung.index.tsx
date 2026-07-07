import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/verwaltung/")({
  beforeLoad: () => {
    throw redirect({ to: "/verwaltung/objekte" });
  },
});