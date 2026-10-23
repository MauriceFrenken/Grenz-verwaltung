import { createFileRoute } from "@tanstack/react-router";
import { KennzahlenSeite } from "@/features/kennzahlen/KennzahlenSeite";

export const Route = createFileRoute("/kennzahlen")({
  head: () => ({ meta: [{ title: "Kennzahlen — Grenz & Co." }] }),
  component: KennzahlenSeite,
});
