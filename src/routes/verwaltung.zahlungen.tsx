import { createFileRoute } from "@tanstack/react-router";
import { ZahlungenTeaser } from "@/features/teaser";
import { seitenGuard } from "@/lib/permissions";

export const Route = createFileRoute("/verwaltung/zahlungen")({
  beforeLoad: seitenGuard("seite.verwaltung.zahlungen"),
  head: () => ({ meta: [{ title: "Zahlungen & Rückstände — FRENKEN Verwaltung" }] }),
  component: ZahlungenTeaser,
});