import { createFileRoute } from "@tanstack/react-router";
import { AuditTeaser } from "@/features/teaser";

export const Route = createFileRoute("/einstellungen/audit")({
  head: () => ({ meta: [{ title: "Audit-Trail — Grenz & Co. Verwaltung" }] }),
  component: AuditTeaser,
});
