import { createFileRoute } from "@tanstack/react-router";
import { AblagePage } from "@/features/dokumente/AblagePage";

export const Route = createFileRoute("/dokumente/ablage")({
  head: () => ({ meta: [{ title: "Dokumentenablage — Grenz & Co. Verwaltung" }] }),
  component: AblagePage,
});
