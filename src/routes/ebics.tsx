import { createFileRoute, redirect } from "@tanstack/react-router";

/** Alte Adresse: Kontoumsätze stehen jetzt unter Kennzahlen → Liquidität. */
export const Route = createFileRoute("/ebics")({
  beforeLoad: () => {
    throw redirect({
      to: "/kennzahlen",
      search: { tab: "liquiditaet" },
      replace: true,
    });
  },
});
