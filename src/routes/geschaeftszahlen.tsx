import { createFileRoute } from "@tanstack/react-router";
import { GeschaeftszahlenSeite } from "@/features/kennzahlen/GeschaeftszahlenSeite";

export const Route = createFileRoute("/geschaeftszahlen")({
  head: () => ({ meta: [{ title: "Geschäftszahlen — Grenz & Co." }] }),
  component: GeschaeftszahlenSeite,
});
