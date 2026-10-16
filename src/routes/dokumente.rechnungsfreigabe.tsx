import { createFileRoute } from "@tanstack/react-router";
import { RechnungsfreigabePage } from "@/features/dokumente/RechnungsfreigabePage";

export const Route = createFileRoute("/dokumente/rechnungsfreigabe")({
  head: () => ({ meta: [{ title: "Rechnungsfreigabe — Grenz & Co. Verwaltung" }] }),
  component: RechnungsfreigabePage,
});
