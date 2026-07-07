import { createFileRoute } from "@tanstack/react-router";
import { SollstellungTeaser } from "@/features/teaser";
import { seitenGuard } from "@/lib/permissions";

export const Route = createFileRoute("/verwaltung/sollstellung")({
  beforeLoad: seitenGuard("seite.verwaltung.sollstellung"),
  head: () => ({ meta: [{ title: "Sollstellung — FRENKEN Verwaltung" }] }),
  component: SollstellungTeaser,
});