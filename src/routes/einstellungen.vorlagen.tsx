import { createFileRoute } from "@tanstack/react-router";
import { VorlagenPage } from "@/features/einstellungen/VorlagenPage";

export const Route = createFileRoute("/einstellungen/vorlagen")({
  head: () => ({ meta: [{ title: "Design-Vorlagen — Grenz & Co." }] }),
  component: VorlagenPage,
});
