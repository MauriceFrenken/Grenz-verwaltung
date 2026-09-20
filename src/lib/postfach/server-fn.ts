import { createServerFn } from "@tanstack/react-start";

import { postfachEintragLaden } from "./eintrag";
import { postfachExportAbschliessen } from "./export";
import {
  postfachAnalyseWiederholen,
  postfachAusDbLaden,
  postfachSynchronisieren,
} from "./sync";

export const postfachLadenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { supabaseAccessToken: string })
  .handler(async ({ data }) => postfachAusDbLaden(data));

export const postfachSyncFn = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as { supabaseAccessToken: string; maxAnalysen?: number },
  )
  .handler(async ({ data }) => postfachSynchronisieren(data));

export const postfachEintragFn = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as { supabaseAccessToken: string; eintragId: string },
  )
  .handler(async ({ data }) => postfachEintragLaden(data));

export const postfachAnalyseWiederholenFn = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as { supabaseAccessToken: string; eintragId: string },
  )
  .handler(async ({ data }) => postfachAnalyseWiederholen(data));

export const postfachExportFn = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as {
        supabaseAccessToken: string;
        eintragId: string;
        realEstateId?: string | null;
        transaktionId?: string | null;
      },
  )
  .handler(async ({ data }) => postfachExportAbschliessen(data));
