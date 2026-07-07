import { createFileRoute } from "@tanstack/react-router";
import { AnmeldenPage } from "@/features/auth/AnmeldenPage";

export const Route = createFileRoute("/anmelden")({
  head: () => ({
    meta: [
      { title: "Anmelden — FRENKEN Verwaltung" },
      { name: "description", content: "Anmeldung bei FRENKEN Verwaltung." },
    ],
  }),
  component: AnmeldenPage,
});
