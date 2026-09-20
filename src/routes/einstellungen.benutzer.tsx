import { createFileRoute } from "@tanstack/react-router";
import { BenutzerPage } from "@/features/einstellungen/BenutzerPage";

export const Route = createFileRoute("/einstellungen/benutzer")({
  head: () => ({ meta: [{ title: "Benutzer — FRENKEN Verwaltung" }] }),
  component: BenutzerPage,
});
