import { createFileRoute } from "@tanstack/react-router";
import { IntegrationenPage } from "@/features/einstellungen/IntegrationenPage";

export const Route = createFileRoute("/einstellungen/integrationen")({
  head: () => ({ meta: [{ title: "Integrationen — Grenz & Co." }] }),
  component: IntegrationenPage,
});