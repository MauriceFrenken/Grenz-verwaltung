import { createFileRoute } from "@tanstack/react-router";
import { GesellschaftenPage } from "@/features/verwaltung/GesellschaftenPage";
import { seitenGuard } from "@/lib/permissions";

export const Route = createFileRoute("/verwaltung/gesellschaften")({
  beforeLoad: seitenGuard("seite.verwaltung.gesellschaften"),
  head: () => ({ meta: [{ title: "Gesellschaften — FRENKEN Verwaltung" }] }),
  component: GesellschaftenPage,
});
