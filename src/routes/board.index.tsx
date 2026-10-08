import { createFileRoute, redirect } from "@tanstack/react-router";

/** Das Cockpit ist die Startseite (`/`). */
export const Route = createFileRoute("/board/")({
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true });
  },
});
