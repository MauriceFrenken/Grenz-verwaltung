import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { CashflowSeite } from "@/modules/cashflow/CashflowSeite";

export const Route = createFileRoute("/board/cashflow")({
  validateSearch: z.object({
    objekt: z.string().optional(),
  }),
  head: () => ({ meta: [{ title: "Cashflow — Grenz & Co. Management Board" }] }),
  component: CashflowSeite,
});
