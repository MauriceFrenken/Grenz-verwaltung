import { createFileRoute } from "@tanstack/react-router";
import { GesellschaftenPage } from "@/features/verwaltung/GesellschaftenPage";

export const Route = createFileRoute("/verwaltung/gesellschaften")({
  head: () => ({ meta: [{ title: "Gesellschaften — FRENKEN Verwaltung" }] }),
  component: GesellschaftenPage,
});
