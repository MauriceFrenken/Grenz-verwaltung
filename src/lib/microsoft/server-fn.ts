import { createServerFn } from "@tanstack/react-start";

import {
  completeMicrosoftConnect,
  disconnectMicrosoft,
  microsoftStatusFuerNutzer,
  probeMicrosoft,
  type MicrosoftConnectInput,
} from "./connect";

function asToken(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const token = (data as { supabaseAccessToken?: unknown }).supabaseAccessToken;
  return typeof token === "string" ? token : "";
}

export const microsoftStatusFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { supabaseAccessToken: string })
  .handler(async ({ data }) => microsoftStatusFuerNutzer(asToken(data)));

export const microsoftConnectFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as MicrosoftConnectInput)
  .handler(async ({ data }) => completeMicrosoftConnect(data));

export const microsoftDisconnectFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { supabaseAccessToken: string })
  .handler(async ({ data }) => disconnectMicrosoft(asToken(data)));

export const microsoftProbeFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { supabaseAccessToken: string })
  .handler(async ({ data }) => probeMicrosoft(asToken(data)));
