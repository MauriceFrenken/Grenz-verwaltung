import { createFileRoute, redirect } from "@tanstack/react-router";

/** Reiter entfernt (25.10.2026): alte Adresse führt zum Überblick der Mandatsakte. */
export const Route = createFileRoute("/mandate/$sfId/exposes")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/mandate/$sfId",
      params: { sfId: params.sfId },
      replace: true,
    });
  },
});
