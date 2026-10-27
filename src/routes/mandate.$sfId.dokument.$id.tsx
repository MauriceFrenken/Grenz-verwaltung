import { createFileRoute, redirect } from "@tanstack/react-router";

/** Früherer Exposé-Editor (eigenes Layout) ist durch den Reiter „Exposé“ ersetzt. */
export const Route = createFileRoute("/mandate/$sfId/dokument/$id")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/mandate/$sfId/expose",
      params: { sfId: params.sfId },
      replace: true,
    });
  },
});
