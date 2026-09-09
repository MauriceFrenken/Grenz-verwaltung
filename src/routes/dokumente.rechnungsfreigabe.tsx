import { createFileRoute } from "@tanstack/react-router";
import { RechnungsfreigabePage } from "@/features/dokumente/RechnungsfreigabePage";
import { seitenGuard } from "@/lib/permissions";

export const Route = createFileRoute("/dokumente/rechnungsfreigabe")({
  beforeLoad: seitenGuard("seite.dokumente.rechnungsfreigabe"),
  head: () => ({ meta: [{ title: "Rechnungsfreigabe — FRENKEN Verwaltung" }] }),
  component: RechnungsfreigabePage,
});
