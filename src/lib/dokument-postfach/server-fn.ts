import { createServerFn } from "@tanstack/react-start";

import { dokumentPosteingangArchivieren } from "./archivieren";
import { dokumentPosteingangSchnellAusfuehren } from "./ausfuehren";
import { dokumentPosteingangAblegen } from "./ablegen";
import { dokumentPosteingangBuchen } from "./buchen";
import { dokumentPosteingangEintragLaden } from "./eintrag";
import {
  dokumentPosteingangAnalyseWiederholen,
  dokumentPosteingangSynchronisieren,
} from "./sync";
import { dokumentPosteingangZuExposesVerschieben } from "./verschieben";
import { dokumentPosteingangZuTam } from "./zu-tam";

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
  .handler(async ({ data }) =>
    dokumentPosteingangAblegen({
      ...data,
      felder: data.felder as
        | import("@/lib/dokument-ai").DokumentAnalyseFelder
        | null
        | undefined,
    }),
  );

export const dokumentPosteingangBuchenFn = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as {
        supabaseAccessToken: string;
        eintragId: string;
        ordnerItemId?: string | null;
        ordnerPfad?: string | null;
        gesellschaftId?: string | null;
        objektId?: string | null;
        felder?: unknown;
      },
  )
  .handler(async ({ data }) =>
    dokumentPosteingangBuchen({
      ...data,
      felder: data.felder as
        | import("@/lib/dokument-ai").DokumentAnalyseFelder
        | null
        | undefined,
    }),
  );

export const dokumentPosteingangSchnellAusfuehrenFn = createServerFn({
  method: "POST",
})
  .validator(
    (data: unknown) =>
      data as { supabaseAccessToken: string; eintragId: string },
  )
  .handler(async ({ data }) => dokumentPosteingangSchnellAusfuehren(data));

export const dokumentPosteingangZuExposesVerschiebenFn = createServerFn({
  method: "POST",
})
  .validator(
    (data: unknown) =>
      data as { supabaseAccessToken: string; eintragId: string },
  )
  .handler(async ({ data }) => dokumentPosteingangZuExposesVerschieben(data));

export const dokumentPosteingangArchivierenFn = createServerFn({
  method: "POST",
})
  .validator(
    (data: unknown) =>
      data as { supabaseAccessToken: string; eintragId: string },
  )
  .handler(async ({ data }) => dokumentPosteingangArchivieren(data));

export const dokumentPosteingangZuTamFn = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as {
        supabaseAccessToken: string;
        eintragId: string;
        ordnerItemId?: string | null;
        ordnerPfad?: string | null;
        felder?: unknown;
      },
  )
  .handler(async ({ data }) =>
    dokumentPosteingangZuTam({
      ...data,
      felder: data.felder as
        | import("@/lib/dokument-ai").DokumentAnalyseFelder
        | null
        | undefined,
    }),
  );
