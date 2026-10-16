import { createFileRoute } from "@tanstack/react-router";
import { MieterPage } from "@/features/verwaltung/MieterPage";

export const Route = createFileRoute("/verwaltung/mieter")({
  head: () => ({ meta: [{ title: "Mieter — Grenz & Co. Verwaltung" }] }),
  component: MieterPage,
});
