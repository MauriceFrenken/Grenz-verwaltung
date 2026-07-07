import { createFileRoute } from "@tanstack/react-router";
import { BenutzerPage } from "@/features/einstellungen/BenutzerPage";
import { seitenGuard } from "@/lib/permissions";

export const Route = createFileRoute("/einstellungen/benutzer")({
  beforeLoad: seitenGuard("seite.einstellungen.benutzer"),
  head: () => ({ meta: [{ title: "Benutzer — FRENKEN Verwaltung" }] }),
  component: BenutzerPage,
});
