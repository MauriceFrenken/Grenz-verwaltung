import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

/** Alter Pfad der Ankaufspipeline; sie heißt jetzt Transaktionen und liegt unter Immobilien. */
export const Route = createFileRoute("/board/pipeline")({
  validateSearch: z.object({ ankauf: z.string().optional() }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/board/transaktionen", search, replace: true });
  },
});
