import { createFileRoute } from "@tanstack/react-router";
import { EinheitenPage } from "@/features/verwaltung/EinheitenPage";
import { seitenGuard } from "@/lib/permissions";

export const Route = createFileRoute("/verwaltung/einheiten")({
  beforeLoad: seitenGuard("seite.verwaltung.einheiten"),
  head: () => ({ meta: [{ title: "Einheiten — FRENKEN Verwaltung" }] }),
  component: EinheitenPage,
});