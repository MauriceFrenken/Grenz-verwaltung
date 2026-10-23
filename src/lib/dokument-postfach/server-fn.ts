import { createServerFn } from "@tanstack/react-start";

import { dokumentPosteingangArchivieren } from "./archivieren";
import { dokumentPosteingangSchnellAusfuehren } from "./ausfuehren";
import { dokumentPosteingangAblegen } from "./ablegen";
import { dokumentPosteingangBuchen } from "./buchen";
import { dokumentPosteingangEintragLaden } from "./eintrag";
import {
  dokumentRechnungsfreigabeLaden,
  dokumentRechnungsfreigabeVerschieben,
  dokumentRechnungsfreigabeZaehlen,
} from "./freigabe";
import { dokumentPosteingangKategorieAblegenJetzt } from "./kategorie-ablegen";
import {
  dokumentPosteingangAnalyseWiederholen,
  dokumentPosteingangAusDbLaden,
  dokumentPosteingangSynchronisieren,
} from "./sync";
import { dokumentPosteingangZuExposesVerschieben } from "./verschieben";
import type { DokumentFreigabeStatus } from "./typen";

export const dokumentPosteingangLadenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { supabaseAccessToken: string })
  .handler(async ({ data }) => dokumentPosteingangAusDbLaden(data));

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
        felder?: unknown;
        istRechnung?: boolean;
      },
  )
  .handler(async ({ data }) =>
    dokumentPosteingangAblegen({
      ...data,
      felder: data.felder as
        import("@/lib/dokument-ai").DokumentAnalyseFelder | null | undefined,
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
        felder?: unknown;
      },
  )
  .handler(async ({ data }) =>
    dokumentPosteingangBuchen({
      ...data,
      felder: data.felder as
        import("@/lib/dokument-ai").DokumentAnalyseFelder | null | undefined,
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

export const dokumentPosteingangKategorieAblegenFn = createServerFn({
  method: "POST",
})
  .validator((data: unknown) => data as { supabaseAccessToken: string })
  .handler(async ({ data }) => dokumentPosteingangKategorieAblegenJetzt(data));

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

export const dokumentRechnungsfreigabeLadenFn = createServerFn({
  method: "POST",
})
  .validator((data: unknown) => data as { supabaseAccessToken: string })
  .handler(async ({ data }) => dokumentRechnungsfreigabeLaden(data));

export const dokumentRechnungsfreigabeZaehlenFn = createServerFn({
  method: "POST",
})
  .validator((data: unknown) => data as { supabaseAccessToken: string })
  .handler(async ({ data }) => dokumentRechnungsfreigabeZaehlen(data));

export const dokumentRechnungsfreigabeVerschiebenFn = createServerFn({
  method: "POST",
})
  .validator(
    (data: unknown) =>
      data as {
        supabaseAccessToken: string;
        eintragId: string;
        freigabeStatus: DokumentFreigabeStatus;
      },
  )
  .handler(async ({ data }) => dokumentRechnungsfreigabeVerschieben(data));
