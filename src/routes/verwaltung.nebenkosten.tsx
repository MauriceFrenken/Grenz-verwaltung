import { createFileRoute } from "@tanstack/react-router";
import { NebenkostenTeaser } from "@/features/teaser";

export const Route = createFileRoute("/verwaltung/nebenkosten")({
  head: () => ({ meta: [{ title: "Nebenkostenabrechnung — FRENKEN Verwaltung" }] }),
  component: NebenkostenTeaser,
});