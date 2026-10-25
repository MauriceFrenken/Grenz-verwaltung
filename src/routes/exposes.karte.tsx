import { createFileRoute } from "@tanstack/react-router";
import { ExposeKartePage } from "@/features/exposes/ExposeKartePage";

export const Route = createFileRoute("/exposes/karte")({
  head: () => ({ meta: [{ title: "Marktkarte — Grenz & Co." }] }),
  component: ExposeKartePage,
});
