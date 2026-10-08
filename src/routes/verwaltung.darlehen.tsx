import { createFileRoute } from "@tanstack/react-router";
import { DarlehenPage } from "@/features/darlehen/DarlehenPage";

export const Route = createFileRoute("/verwaltung/darlehen")({
  head: () => ({ meta: [{ title: "Darlehen — FRENKEN Verwaltung" }] }),
  component: DarlehenPage,
});
