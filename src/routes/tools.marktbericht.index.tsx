import { createFileRoute } from "@tanstack/react-router";

import { MarktberichtListePage } from "@/features/marktbericht/MarktberichtListePage";

export const Route = createFileRoute("/tools/marktbericht/")({
  head: () => ({ meta: [{ title: "Marktbericht — Grenz & Co." }] }),
  component: MarktberichtListePage,
});
