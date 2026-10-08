import { createFileRoute, redirect } from "@tanstack/react-router";

/** Darlehen gibt es nur noch einmal: unter Steuerung. */
export const Route = createFileRoute("/verwaltung/darlehen")({
  beforeLoad: () => {
    throw redirect({ to: "/board/darlehen", replace: true });
  },
});
