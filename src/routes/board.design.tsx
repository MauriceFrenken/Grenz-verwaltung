import { createFileRoute } from "@tanstack/react-router";
import { DesignSeite } from "@/modules/shell/DesignSeite";

export const Route = createFileRoute("/board/design")({
  head: () => ({
    meta: [{ title: "Designsystem — Grenz & Co. Management Board" }],
  }),
  component: DesignSeite,
});
