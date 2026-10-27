import { createFileRoute } from "@tanstack/react-router";

import { AufgabenSeite } from "@/features/aufgaben/AufgabenSeite";

export const Route = createFileRoute("/aufgaben")({
  head: () => ({ meta: [{ title: "Aufgaben — Grenz & Co." }] }),
  component: AufgabenSeite,
});
