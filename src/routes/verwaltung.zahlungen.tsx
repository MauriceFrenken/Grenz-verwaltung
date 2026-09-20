import { createFileRoute } from "@tanstack/react-router";
import { ZahlungenTeaser } from "@/features/teaser";

export const Route = createFileRoute("/verwaltung/zahlungen")({
  head: () => ({ meta: [{ title: "Zahlungen & Rückstände — FRENKEN Verwaltung" }] }),
  component: ZahlungenTeaser,
});