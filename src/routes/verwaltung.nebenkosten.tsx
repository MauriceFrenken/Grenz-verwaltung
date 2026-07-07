import { createFileRoute } from "@tanstack/react-router";
import { NebenkostenPage } from "@/features/verwaltung/NebenkostenPage";
import { seitenGuard } from "@/lib/permissions";

export const Route = createFileRoute("/verwaltung/nebenkosten")({
  beforeLoad: seitenGuard("seite.verwaltung.nebenkosten"),
  head: () => ({ meta: [{ title: "Nebenkostenabrechnung — FRENKEN Verwaltung" }] }),
  component: NebenkostenPage,
});