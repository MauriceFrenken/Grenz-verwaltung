import { createFileRoute } from "@tanstack/react-router";
import { AuditPage } from "@/features/einstellungen/AuditPage";

export const Route = createFileRoute("/einstellungen/audit")({
  head: () => ({ meta: [{ title: "Audit-Trail — Grenz & Co." }] }),
  component: AuditPage,
});
