import { createFileRoute, redirect } from "@tanstack/react-router";

/** Alte Adresse des Reiters „Exposé & Teaser“ führt zum Reiter „Exposé“. */
export const Route = createFileRoute("/mandate/$sfId/exposes")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/mandate/$sfId/expose",
      params: { sfId: params.sfId },
      replace: true,
    });
  },
});
