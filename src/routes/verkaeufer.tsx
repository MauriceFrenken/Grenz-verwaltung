import { createFileRoute } from "@tanstack/react-router";

import { VerkaeuferPage } from "@/features/markt-radar/VerkaeuferPage";

export const Route = createFileRoute("/verkaeufer")({
  head: () => ({ meta: [{ title: "Verkäufer — Grenz & Co." }] }),
  component: VerkaeuferPage,
});
