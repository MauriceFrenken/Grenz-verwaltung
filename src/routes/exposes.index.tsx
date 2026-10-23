import { createFileRoute } from "@tanstack/react-router";
import { ExposeListePage } from "@/features/exposes/ExposeListePage";

export const Route = createFileRoute("/exposes/")({
  head: () => ({ meta: [{ title: "Offene Exposés — Grenz & Co." }] }),
  component: ExposeListePage,
});