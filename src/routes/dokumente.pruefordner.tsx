import { createFileRoute } from "@tanstack/react-router";
import { PostfachPage } from "@/features/dokumente/PostfachPage";

export const Route = createFileRoute("/dokumente/pruefordner")({
  head: () => ({ meta: [{ title: "Postfach — FRENKEN Verwaltung" }] }),
  component: PostfachPage,
});
