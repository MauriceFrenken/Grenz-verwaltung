import { createFileRoute } from "@tanstack/react-router";
import { EinheitenTeaser } from "@/features/teaser";
import { seitenGuard } from "@/lib/permissions";

export const Route = createFileRoute("/verwaltung/einheiten")({
  beforeLoad: seitenGuard("seite.verwaltung.einheiten"),
  head: () => ({ meta: [{ title: "Einheiten — FRENKEN Verwaltung" }] }),
  component: EinheitenTeaser,
});