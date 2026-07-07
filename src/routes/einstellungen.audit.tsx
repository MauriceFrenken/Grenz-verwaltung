import { createFileRoute } from "@tanstack/react-router";
import { AuditPage } from "@/features/dokumente/AuditPage";
import { seitenGuard } from "@/lib/permissions";

export const Route = createFileRoute("/einstellungen/audit")({
  beforeLoad: seitenGuard("seite.einstellungen.audit"),
  head: () => ({ meta: [{ title: "Audit-Trail — FRENKEN Verwaltung" }] }),
  component: AuditPage,
});
