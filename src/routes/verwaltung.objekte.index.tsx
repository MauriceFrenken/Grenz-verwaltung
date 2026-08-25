import { createFileRoute } from "@tanstack/react-router";
import { ObjektePage } from "@/features/verwaltung/ObjektePage";

export const Route = createFileRoute("/verwaltung/objekte/")({
  component: ObjektePage,
});
