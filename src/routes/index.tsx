import { createFileRoute } from "@tanstack/react-router";
import { DashboardTeaser } from "@/features/teaser";
import { seitenGuard } from "@/lib/permissions";

export const Route = createFileRoute("/")({
  beforeLoad: seitenGuard("seite.dashboard"),
  head: () => ({
    meta: [
      { title: "Übersicht — FRENKEN Verwaltung" },
      { name: "description", content: "Kennzahlen, offene Aufgaben und Fristen aus allen Automatisierungen." },
    ],
  }),
  component: DashboardTeaser,
});
