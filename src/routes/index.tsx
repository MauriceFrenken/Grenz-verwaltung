import { createFileRoute } from "@tanstack/react-router";
import { DashboardTeaser } from "@/features/teaser";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Übersicht — FRENKEN Verwaltung" },
      { name: "description", content: "Kennzahlen, offene Aufgaben und Fristen aus allen Automatisierungen." },
    ],
  }),
  component: DashboardTeaser,
});
