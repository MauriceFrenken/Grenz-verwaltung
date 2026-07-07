import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/transaktionen/")({
  beforeLoad: () => {
    throw redirect({ to: "/transaktionen/liste" });
  },
});