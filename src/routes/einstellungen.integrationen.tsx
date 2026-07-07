import { createFileRoute } from "@tanstack/react-router";
import { IntegrationenTeaser } from "@/features/teaser";
import { seitenGuard } from "@/lib/permissions";

export const Route = createFileRoute("/einstellungen/integrationen")({
  beforeLoad: seitenGuard("seite.einstellungen.integrationen"),
  head: () => ({ meta: [{ title: "Integrationen — FRENKEN Verwaltung" }] }),
  component: IntegrationenTeaser,
});