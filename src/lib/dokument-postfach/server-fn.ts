import { createServerFn } from "@tanstack/react-start";

import { dokumentPosteingangAblegen } from "./ablegen";
import { dokumentPosteingangEintragLaden } from "./eintrag";
import {
  dokumentPosteingangAnalyseWiederholen,
  dokumentPosteingangSynchronisieren,
} from "./sync";

export const dokumentPosteingangSyncFn = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as { supabaseAccessToken: string; maxAnalysen?: number },
  )
  .handler(async ({ data }) => dokumentPosteingangSynchronisieren(data));

export const dokumentPosteingangEintragFn = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as { supabaseAccessToken: string; eintragId: string },
  )
  .handler(async ({ data }) => dokumentPosteingangEintragLaden(data));

export const dokumentPosteingangAnalyseWiederholenFn = createServerFn({
  method: "POST",
})
  .validator(
    (data: unknown) =>
      data as { supabaseAccessToken: string; eintragId: string },
  )
  .handler(async ({ data }) => dokumentPosteingangAnalyseWiederholen(data));

export const dokumentPosteingangAblegenFn = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as {
        supabaseAccessToken: string;
        eintragId: string;
        ordnerItemId: string;
        ordnerPfad: string;
        gesellschaftId?: string | null;
        objektId?: string | null;
        felder?: unknown;
        istRechnung?: boolean;
      },
  )
  .handler(async ({ data }) => dokumentPosteingangAblegen(data));
