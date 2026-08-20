import { createFileRoute } from "@tanstack/react-router";
import { TransaktionslistePage } from "@/features/transaktionen/TransaktionslistePage";
import { seitenGuard } from "@/lib/permissions";

export const Route = createFileRoute("/transaktionen/liste")({
  beforeLoad: seitenGuard("seite.transaktionen.liste"),
  head: () => ({ meta: [{ title: "Offene Exposés — FRENKEN Verwaltung" }] }),
  component: TransaktionslistePage,
});