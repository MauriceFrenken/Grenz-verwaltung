import { createFileRoute, redirect } from "@tanstack/react-router";

/** Alte Adresse: die Marktanalyse ist jetzt Kennzahlen → Markt. */
export const Route = createFileRoute("/exposes/auswertung")({
  beforeLoad: () => {
    throw redirect({
      to: "/kennzahlen",
      search: { tab: "markt" },
      replace: true,
    });
  },
});
