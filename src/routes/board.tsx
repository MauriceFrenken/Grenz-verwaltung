import { Outlet, createFileRoute } from "@tanstack/react-router";
import { BoardRahmen } from "@/modules/shell/BoardRahmen";

export const Route = createFileRoute("/board")({
  head: () => ({ meta: [{ title: "Steuerung — FRENKEN" }] }),
  component: () => (
    <BoardRahmen>
      <Outlet />
    </BoardRahmen>
  ),
});
