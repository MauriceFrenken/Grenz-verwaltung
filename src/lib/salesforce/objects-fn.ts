import { createServerFn } from "@tanstack/react-start";

import { mitSalesforceCredentials } from "./server-credentials";
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
  /** Serverseitig erneuerter Access Token — Client übernimmt ihn. */
  erneuerteSession?: {
    accessToken: string;
    instanceUrl: string;
    refreshToken: string;
  };
};

export const fetchSalesforceObjekteFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as SalesforceObjekteInput)
  .handler(async ({ data }): Promise<SalesforceObjekteResult> => {
    const search = data.search?.trim() ?? "";
    const adresse = data.adresse?.trim() ?? "";

    if (search && search.length < 2) {
      return {
        recommendations: [],
        results: [],
        totalLoaded: 0,
        authSource: "session",
      };
    }

    const { ergebnis: all, creds } = await mitSalesforceCredentials(
      {
        accessToken: data.accessToken,
        instanceUrl: data.instanceUrl,
        refreshToken: data.refreshToken,
      },
      (c) =>
        search
          ? searchSalesforceObjekte(c.accessToken, c.instanceUrl, search)
          : fetchAllSalesforceObjekte(c.accessToken, c.instanceUrl),
    );

    const recommendations = adresse ? rankObjekteByAdresse(all, adresse) : [];

    return {
      recommendations,
      results: all,
      totalLoaded: all.length,
      authSource: creds.source,
      erneuerteSession: creds.erneuert,
    };
  });
