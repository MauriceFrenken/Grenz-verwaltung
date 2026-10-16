import { createFileRoute } from "@tanstack/react-router";
import { TransaktionslistePage } from "@/features/transaktionen/TransaktionslistePage";

export const Route = createFileRoute("/transaktionen/liste")({
  head: () => ({ meta: [{ title: "Offene Exposés — Grenz & Co. Verwaltung" }] }),
  component: TransaktionslistePage,
});