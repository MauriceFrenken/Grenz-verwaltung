import { createFileRoute } from "@tanstack/react-router";
import { EinheitenPage } from "@/features/verwaltung/EinheitenPage";

export interface EinheitenSuche {
  gesellschaft?: string;
  objekt?: string;
}

export const Route = createFileRoute("/verwaltung/einheiten")({
  validateSearch: (search: Record<string, unknown>): EinheitenSuche => ({
    gesellschaft:
      typeof search.gesellschaft === "string" ? search.gesellschaft : undefined,
    objekt: typeof search.objekt === "string" ? search.objekt : undefined,
  }),
  head: () => ({ meta: [{ title: "Einheiten — Grenz & Co. Verwaltung" }] }),
  component: EinheitenPage,
});
