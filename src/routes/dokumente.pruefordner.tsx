import { createFileRoute } from "@tanstack/react-router";
import { PruefOrdnerPage } from "@/features/dokumente/PruefOrdnerPage";
import { seitenGuard } from "@/lib/permissions";

export const Route = createFileRoute("/dokumente/pruefordner")({
  beforeLoad: seitenGuard("seite.dokumente.pruefordner"),
  head: () => ({ meta: [{ title: "Prüf-Ordner — FRENKEN Verwaltung" }] }),
  component: PruefOrdnerPage,
});