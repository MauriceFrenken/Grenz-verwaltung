import { createFileRoute } from "@tanstack/react-router";
import { ExposeListePage } from "@/features/exposes/ExposeListePage";

export const Route = createFileRoute("/exposes/")({
  head: () => ({ meta: [{ title: "Exposéanalyse — Grenz & Co." }] }),
  component: ExposeListePage,
});
