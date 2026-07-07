import { createFileRoute } from "@tanstack/react-router";
import { PruefOrdnerTeaser } from "@/features/teaser";
import { seitenGuard } from "@/lib/permissions";

export const Route = createFileRoute("/dokumente/pruefordner")({
  beforeLoad: seitenGuard("seite.dokumente.pruefordner"),
  head: () => ({ meta: [{ title: "Prüf-Ordner — FRENKEN Verwaltung" }] }),
  component: PruefOrdnerTeaser,
});