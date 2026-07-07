import { createFileRoute } from "@tanstack/react-router";
import { EinladungPage } from "@/features/auth/EinladungPage";

export const Route = createFileRoute("/einladung")({
  head: () => ({ meta: [{ title: "Einladung — FRENKEN Verwaltung" }] }),
  component: EinladungPage,
});
