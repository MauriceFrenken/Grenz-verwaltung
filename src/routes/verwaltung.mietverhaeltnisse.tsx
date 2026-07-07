import { createFileRoute } from "@tanstack/react-router";
import { MietverhaeltnisseTeaser } from "@/features/teaser";
import { seitenGuard } from "@/lib/permissions";

export const Route = createFileRoute("/verwaltung/mietverhaeltnisse")({
  beforeLoad: seitenGuard("seite.verwaltung.mietverhaeltnisse"),
  head: () => ({ meta: [{ title: "Mietverhältnisse — FRENKEN Verwaltung" }] }),
  component: MietverhaeltnisseTeaser,
});