import { createServerFn } from "@tanstack/react-start";

import {
  clearSalesforceCredentialsCache,
  resolveSalesforceCredentials,
} from "./server-credentials";
import {
  fetchAllSalesforceTransaktionen,
  rankTransaktionenByAdresse,
  searchSalesforceTransaktionen,
  type SalesforceTransaktion,
  type SalesforceTransaktionMatch,
} from "./transactions";

export type SalesforceTransaktionenInput = {
  /** Optional — Override; Standard ist SALESFORCE_ACCESS_TOKEN aus der Env */
  accessToken?: string;
  instanceUrl?: string;
  refreshToken?: string;
  /** Objektadresse aus dem Exposé (für Empfehlungen) */
  adresse?: string;
  /** Freitext-Suche in Salesforce */
  search?: string;
};

export type SalesforceTransaktionenResult = {
  recommendations: SalesforceTransaktionMatch[];
  results: SalesforceTransaktion[];
  totalLoaded: number;
  authSource: "env" | "session";
};

function looksLikeAuthError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /INVALID_SESSION|Session expired|401|UNAUTHORIZED/i.test(msg);
}

export const fetchSalesforceTransaktionenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as SalesforceTransaktionenInput)
  .handler(async ({ data }): Promise<SalesforceTransaktionenResult> => {
    const sessionHint = {
      accessToken: data.accessToken,
      instanceUrl: data.instanceUrl,
      refreshToken: data.refreshToken,
    };

    let creds = await resolveSalesforceCredentials(sessionHint);

    const search = data.search?.trim() ?? "";
    const adresse = data.adresse?.trim() ?? "";

    if (search && search.length < 2) {
      return {
        recommendations: [],
        results: [],
        totalLoaded: 0,
        authSource: creds.source,
      };
    }

    const load = async () =>
      search
        ? searchSalesforceTransaktionen(creds.accessToken, creds.instanceUrl, search)
        : fetchAllSalesforceTransaktionen(creds.accessToken, creds.instanceUrl);

    let all: SalesforceTransaktion[];
    try {
      all = await load();
    } catch (err) {
      if (!looksLikeAuthError(err)) throw err;
      clearSalesforceCredentialsCache();
      creds = await resolveSalesforceCredentials(sessionHint);
      all = await load();
    }

    const recommendations = adresse ? rankTransaktionenByAdresse(all, adresse) : [];

    return {
      recommendations,
      results: all,
      totalLoaded: all.length,
      authSource: creds.source,
    };
  });
