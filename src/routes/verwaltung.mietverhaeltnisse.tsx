import { createFileRoute } from "@tanstack/react-router";
import { MietverhaeltnissePage } from "@/features/verwaltung/MietverhaeltnissePage";
import { seitenGuard } from "@/lib/permissions";

export const Route = createFileRoute("/verwaltung/mietverhaeltnisse")({
  beforeLoad: seitenGuard("seite.verwaltung.mietverhaeltnisse"),
  head: () => ({ meta: [{ title: "Mietverhältnisse — FRENKEN Verwaltung" }] }),
  component: MietverhaeltnissePage,
});