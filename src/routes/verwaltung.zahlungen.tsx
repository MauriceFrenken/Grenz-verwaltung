import { createFileRoute } from "@tanstack/react-router";
import { ZahlungenPage } from "@/features/verwaltung/ZahlungenPage";
import { seitenGuard } from "@/lib/permissions";

export const Route = createFileRoute("/verwaltung/zahlungen")({
  beforeLoad: seitenGuard("seite.verwaltung.zahlungen"),
  head: () => ({ meta: [{ title: "Zahlungen & Rückstände — FRENKEN Verwaltung" }] }),
  component: ZahlungenPage,
});