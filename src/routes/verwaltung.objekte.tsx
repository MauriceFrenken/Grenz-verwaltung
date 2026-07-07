import { createFileRoute } from "@tanstack/react-router";
import { ObjekteTeaser } from "@/features/teaser";
import { seitenGuard } from "@/lib/permissions";

export const Route = createFileRoute("/verwaltung/objekte")({
  beforeLoad: seitenGuard("seite.verwaltung.objekte"),
  head: () => ({ meta: [{ title: "Objekte — FRENKEN Verwaltung" }] }),
  component: ObjekteTeaser,
});