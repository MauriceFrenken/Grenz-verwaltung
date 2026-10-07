import { Outlet, createFileRoute } from "@tanstack/react-router";
import { BoardShell } from "@/modules/shell/BoardShell";

export const Route = createFileRoute("/board")({
  head: () => ({ meta: [{ title: "Management Board — FRENKEN" }] }),
  component: () => (
    <BoardShell>
      <Outlet />
    </BoardShell>
  ),
});
