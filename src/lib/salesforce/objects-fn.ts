import { createServerFn } from "@tanstack/react-start";

import {
  clearSalesforceCredentialsCache,
  resolveSalesforceCredentials,
} from "./server-credentials";
import {
  fetchAllSalesforceObjekte,
  rankObjekteByAdresse,
  searchSalesforceObjekte,
  type SalesforceObjekt,
  type SalesforceObjektMatch,
} from "./objects";

export type SalesforceObjekteInput = {
  accessToken?: string;
  instanceUrl?: string;
  refreshToken?: string;
  /** Objektadresse aus dem Exposé (für Empfehlungen) */
  adresse?: string;
  /** Freitext-Suche in Salesforce */
  search?: string;
};

export type SalesforceObjekteResult = {
  recommendations: SalesforceObjektMatch[];
  results: SalesforceObjekt[];
  totalLoaded: number;
  authSource: "env" | "session";
};

function looksLikeAuthError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /INVALID_SESSION|Session expired|401|UNAUTHORIZED/i.test(msg);
}

export const fetchSalesforceObjekteFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as SalesforceObjekteInput)
  .handler(async ({ data }): Promise<SalesforceObjekteResult> => {
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
        ? searchSalesforceObjekte(creds.accessToken, creds.instanceUrl, search)
        : fetchAllSalesforceObjekte(creds.accessToken, creds.instanceUrl);

    let all: SalesforceObjekt[];
    try {
      all = await load();
    } catch (err) {
      if (!looksLikeAuthError(err)) throw err;
      clearSalesforceCredentialsCache();
      creds = await resolveSalesforceCredentials(sessionHint);
      all = await load();
    }

    const recommendations = adresse ? rankObjekteByAdresse(all, adresse) : [];

    return {
      recommendations,
      results: all,
      totalLoaded: all.length,
      authSource: creds.source,
    };
  });
