import { createFileRoute } from "@tanstack/react-router";
import { UebersichtPage } from "@/features/uebersicht/UebersichtPage";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Übersicht — Grenz & Co." }] }),
  component: UebersichtPage,
});
