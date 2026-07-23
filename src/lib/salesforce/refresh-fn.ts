import { createServerFn } from "@tanstack/react-start";

import { refreshSalesforceAccessToken } from "./token-exchange";

export type SalesforceRefreshInput = {
  refreshToken: string;
};

export const refreshSalesforceTokenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as SalesforceRefreshInput)
  .handler(async ({ data }) => {
    const refreshToken = data.refreshToken?.trim();
    if (!refreshToken) {
      throw new Error("refreshToken ist erforderlich.");
    }
    return refreshSalesforceAccessToken(refreshToken);
  });
