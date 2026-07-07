import { createFileRoute } from "@tanstack/react-router";
import { RollenPage } from "@/features/einstellungen/RollenPage";
import { seitenGuard } from "@/lib/permissions";

export const Route = createFileRoute("/einstellungen/rollen")({
  beforeLoad: seitenGuard("seite.einstellungen.rollen"),
  head: () => ({ meta: [{ title: "Rollen & Rechte — FRENKEN Verwaltung" }] }),
  component: RollenPage,
});