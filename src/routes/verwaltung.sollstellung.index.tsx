import { createFileRoute } from "@tanstack/react-router";
import { SollstellungPage } from "@/features/verwaltung/SollstellungPage";

export const Route = createFileRoute("/verwaltung/sollstellung/")({
  component: SollstellungPage,
});
