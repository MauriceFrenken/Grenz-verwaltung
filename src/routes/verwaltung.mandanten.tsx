import { createFileRoute } from "@tanstack/react-router";
import { MandantenPage } from "@/features/verwaltung/MandantenPage";
import { seitenGuard } from "@/lib/permissions";

export const Route = createFileRoute("/verwaltung/mandanten")({
  beforeLoad: seitenGuard("seite.verwaltung.mandanten"),
  head: () => ({ meta: [{ title: "Mandanten — FRENKEN Verwaltung" }] }),
  component: MandantenPage,
});
