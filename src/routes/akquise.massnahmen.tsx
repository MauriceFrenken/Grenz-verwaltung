import { createFileRoute } from "@tanstack/react-router";

import { MassnahmenSeite } from "@/features/akquise/MassnahmenSeite";

export const Route = createFileRoute("/akquise/massnahmen")({
  head: () => ({ meta: [{ title: "Akquise-Maßnahmen — Grenz & Co." }] }),
  component: MassnahmenSeite,
});
