import { createServerFn } from "@tanstack/react-start";

import { handleMicrosoftOAuthRequest } from "@/lib/microsoft-oauth-handler";

type OAuthRequest = Record<string, unknown>;

export const microsoftOAuthFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as OAuthRequest)
  .handler(async ({ data: body }) => handleMicrosoftOAuthRequest(body));
