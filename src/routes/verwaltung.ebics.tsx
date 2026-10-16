import { createFileRoute } from "@tanstack/react-router";
import { EbicsSeite } from "@/features/verwaltung/EbicsSeite";

export const Route = createFileRoute("/verwaltung/ebics")({
  head: () => ({ meta: [{ title: "EBICS — Grenz & Co. Verwaltung" }] }),
  component: EbicsSeite,
});
