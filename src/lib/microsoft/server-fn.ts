import { createServerFn } from "@tanstack/react-start";

import {
  microsoftAnhaengeNachOneDriveAblegen,
  microsoftDokumentPosteingangLesen,
  microsoftOneDriveKinderLesen,
} from "./ablage";
import {
  completeMicrosoftConnect,
  disconnectMicrosoft,
  microsoftStatusFuerNutzer,
  probeMicrosoft,
} from "./connect";
import { microsoftAnhaengeLesen, microsoftPosteingangLesen } from "./postfach";

function asToken(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const token = (data as { supabaseAccessToken?: unknown }).supabaseAccessToken;
  return typeof token === "string" ? token : "";
}

export const microsoftStatusFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { supabaseAccessToken: string })
  .handler(async ({ data }) => microsoftStatusFuerNutzer(asToken(data)));

export const microsoftConnectFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { supabaseAccessToken: string })
  .handler(async ({ data }) => completeMicrosoftConnect({ supabaseAccessToken: asToken(data) }));

export const microsoftDisconnectFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { supabaseAccessToken: string })
  .handler(async ({ data }) => disconnectMicrosoft(asToken(data)));

export const microsoftProbeFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { supabaseAccessToken: string })
  .handler(async ({ data }) => probeMicrosoft(asToken(data)));

export const microsoftPosteingangFn = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as {
        supabaseAccessToken: string;
        anzahl?: number;
        seit?: string;
        nurMitAnhang?: boolean;
      },
  )
  .handler(async ({ data }) => microsoftPosteingangLesen(data));

export const microsoftAnhaengeFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { supabaseAccessToken: string; nachrichtId: string })
  .handler(async ({ data }) => microsoftAnhaengeLesen(data));

export const microsoftOneDriveKinderFn = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as {
        supabaseAccessToken: string;
        itemId?: string | null;
      },
  )
  .handler(async ({ data }) =>
    microsoftOneDriveKinderLesen({
      supabaseAccessToken: asToken(data),
      itemId: data.itemId,
    }),
  );

export const microsoftDokumentPosteingangFn = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as {
        supabaseAccessToken: string;
        anzahl?: number;
      },
  )
  .handler(async ({ data }) =>
    microsoftDokumentPosteingangLesen({
      supabaseAccessToken: asToken(data),
      anzahl: data.anzahl,
    }),
  );

export const microsoftAnhangAblegenFn = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as {
        supabaseAccessToken: string;
        nachrichtId: string;
        postfach?: string | null;
        parentItemId?: string | null;
      },
  )
  .handler(async ({ data }) =>
    microsoftAnhaengeNachOneDriveAblegen({
      supabaseAccessToken: asToken(data),
      nachrichtId: data.nachrichtId,
      postfach: data.postfach,
      parentItemId: data.parentItemId,
    }),
  );
