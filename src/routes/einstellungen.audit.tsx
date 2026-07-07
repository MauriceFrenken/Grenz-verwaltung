import { createFileRoute } from "@tanstack/react-router";
import { AuditTeaser } from "@/features/teaser";
import { seitenGuard } from "@/lib/permissions";

export const Route = createFileRoute("/einstellungen/audit")({
  beforeLoad: seitenGuard("seite.einstellungen.audit"),
  head: () => ({ meta: [{ title: "Audit-Trail — FRENKEN Verwaltung" }] }),
  component: AuditTeaser,
});
