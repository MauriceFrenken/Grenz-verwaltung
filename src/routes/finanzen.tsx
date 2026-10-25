import { createFileRoute } from "@tanstack/react-router";
import { FinanzenSeite } from "@/features/kennzahlen/FinanzenSeite";

type FinanzenSearch = { reiter?: "konto" };

export const Route = createFileRoute("/finanzen")({
  validateSearch: (search: Record<string, unknown>): FinanzenSearch => ({
    reiter: search.reiter === "konto" ? "konto" : undefined,
  }),
  head: () => ({ meta: [{ title: "Finanzen — Grenz & Co." }] }),
  component: function FinanzenRoute() {
    const { reiter } = Route.useSearch();
    return (
      <FinanzenSeite start={reiter === "konto" ? "konto" : "ueberblick"} />
    );
  },
});
