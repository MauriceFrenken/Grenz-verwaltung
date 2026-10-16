import { createFileRoute } from "@tanstack/react-router";
import { MietenSeite } from "@/modules/mieten/MietenSeite";

export const Route = createFileRoute("/board/mieten")({
  head: () => ({ meta: [{ title: "Mieten — Grenz & Co. Management Board" }] }),
  component: MietenSeite,
});
