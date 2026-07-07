import { createFileRoute } from "@tanstack/react-router";
import { SollstellungPage } from "@/features/verwaltung/SollstellungPage";
import { seitenGuard } from "@/lib/permissions";

export const Route = createFileRoute("/verwaltung/sollstellung")({
  beforeLoad: seitenGuard("seite.verwaltung.sollstellung"),
  head: () => ({ meta: [{ title: "Sollstellung — FRENKEN Verwaltung" }] }),
  component: SollstellungPage,
});