import { createFileRoute } from "@tanstack/react-router";
import { PostfachTeaser } from "@/features/teaser";
import { seitenGuard } from "@/lib/permissions";

export const Route = createFileRoute("/dokumente/pruefordner")({
  beforeLoad: seitenGuard("seite.dokumente.pruefordner"),
  head: () => ({ meta: [{ title: "Postfach — FRENKEN Verwaltung" }] }),
  component: PostfachTeaser,
});
