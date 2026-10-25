import { createFileRoute } from "@tanstack/react-router";
import { ExposeAuswertungPage } from "@/features/exposes/ExposeAuswertungPage";

export const Route = createFileRoute("/exposes/auswertung")({
  head: () => ({ meta: [{ title: "Marktanalyse — Grenz & Co." }] }),
  component: ExposeAuswertungPage,
});
