import { createFileRoute } from "@tanstack/react-router";

import { GesellschafterberichtSeite } from "@/features/gesellschafterbericht/GesellschafterberichtSeite";

export const Route = createFileRoute("/gesellschafterbericht")({
  head: () => ({ meta: [{ title: "Gesellschafterbericht · Grenz & Co." }] }),
  component: GesellschafterberichtSeite,
});
