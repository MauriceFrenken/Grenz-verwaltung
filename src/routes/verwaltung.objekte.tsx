import { createFileRoute } from "@tanstack/react-router";
import { ObjektePage } from "@/features/verwaltung/ObjektePage";
import { seitenGuard } from "@/lib/permissions";

export const Route = createFileRoute("/verwaltung/objekte")({
  beforeLoad: seitenGuard("seite.verwaltung.objekte"),
  head: () => ({ meta: [{ title: "Objekte — FRENKEN Verwaltung" }] }),
  component: ObjektePage,
});