import { createFileRoute } from "@tanstack/react-router";
import { MietenSeite } from "@/modules/mieten/MietenSeite";

export const Route = createFileRoute("/board/mieten")({
  head: () => ({ meta: [{ title: "Mieten — FRENKEN Management Board" }] }),
  component: MietenSeite,
});
