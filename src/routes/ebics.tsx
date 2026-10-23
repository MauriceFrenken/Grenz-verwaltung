import { createFileRoute } from "@tanstack/react-router";
import { EbicsSeite } from "@/features/ebics/EbicsSeite";

export const Route = createFileRoute("/ebics")({
  head: () => ({ meta: [{ title: "EBICS — Grenz & Co." }] }),
  component: EbicsSeite,
});
