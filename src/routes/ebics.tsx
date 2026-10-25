import { createFileRoute, redirect } from "@tanstack/react-router";

/** Alte Adresse: Kontoumsätze stehen jetzt unter Finanzen. */
export const Route = createFileRoute("/ebics")({
  beforeLoad: () => {
    throw redirect({
      to: "/finanzen",
      search: { reiter: "konto" },
      replace: true,
    });
  },
});
