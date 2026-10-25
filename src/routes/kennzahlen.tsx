import { createFileRoute, redirect } from "@tanstack/react-router";

/** Alte Adresse: Kennzahlen sind jetzt Geschäftszahlen und Finanzen. */
export const Route = createFileRoute("/kennzahlen")({
  beforeLoad: () => {
    throw redirect({ to: "/geschaeftszahlen", replace: true });
  },
});
