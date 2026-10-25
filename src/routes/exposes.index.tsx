import { createFileRoute } from "@tanstack/react-router";
import { ExposeListePage } from "@/features/exposes/ExposeListePage";

export const Route = createFileRoute("/exposes/")({
  head: () => ({ meta: [{ title: "Angebotseingang — Grenz & Co." }] }),
  component: ExposeListePage,
});
