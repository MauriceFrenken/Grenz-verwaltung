import { createFileRoute } from "@tanstack/react-router";
import { MietverhaeltnissePage } from "@/features/verwaltung/MietverhaeltnissePage";

export interface MietverhaeltnisseSuche {
  gesellschaft?: string;
  objekt?: string;
}

export const Route = createFileRoute("/verwaltung/mietverhaeltnisse")({
  validateSearch: (
    search: Record<string, unknown>,
  ): MietverhaeltnisseSuche => ({
    gesellschaft:
      typeof search.gesellschaft === "string" ? search.gesellschaft : undefined,
    objekt: typeof search.objekt === "string" ? search.objekt : undefined,
  }),
  head: () => ({ meta: [{ title: "Mietverhältnisse — FRENKEN Verwaltung" }] }),
  component: MietverhaeltnissePage,
});
