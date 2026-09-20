import { createFileRoute } from "@tanstack/react-router";
import { AuditTeaser } from "@/features/teaser";

export const Route = createFileRoute("/einstellungen/audit")({
  head: () => ({ meta: [{ title: "Audit-Trail — FRENKEN Verwaltung" }] }),
  component: AuditTeaser,
});
