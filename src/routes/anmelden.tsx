import { createFileRoute } from "@tanstack/react-router";
import { AnmeldenPage } from "@/features/auth/AnmeldenPage";
import { sichererRueckweg } from "@/lib/auth-pfade";

export type AnmeldenSuche = {
  von?: string;
};

export const Route = createFileRoute("/anmelden")({
  validateSearch: (search: Record<string, unknown>): AnmeldenSuche => ({
    von: sichererRueckweg(search.von),
  }),
  head: () => ({
    meta: [
      { title: "Anmelden — Grenz & Co. Verwaltung" },
      { name: "description", content: "Anmeldung bei Grenz & Co. Verwaltung." },
    ],
  }),
  component: AnmeldenPage,
});
