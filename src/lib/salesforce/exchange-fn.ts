import { createServerFn } from "@tanstack/react-start";

import {
  exchangeSalesforceAuthorizationCode,
  type SalesforceTokenExchangeInput,
} from "./token-exchange";

export const exchangeSalesforceCodeFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as SalesforceTokenExchangeInput)
  .handler(async ({ data }) => exchangeSalesforceAuthorizationCode(data));
