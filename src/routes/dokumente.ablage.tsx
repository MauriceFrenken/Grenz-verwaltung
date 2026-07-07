import { createFileRoute } from "@tanstack/react-router";
import { AblagePage } from "@/features/dokumente/AblagePage";
import { seitenGuard } from "@/lib/permissions";

export const Route = createFileRoute("/dokumente/ablage")({
  beforeLoad: seitenGuard("seite.dokumente.ablage"),
  head: () => ({ meta: [{ title: "Dokumentenablage — FRENKEN Verwaltung" }] }),
  component: AblagePage,
});