import { createServerFn } from "@tanstack/react-start";

import { mitSalesforceCredentials } from "./server-credentials";
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
  /** Serverseitig erneuerter Access Token — Client übernimmt ihn. */
  erneuerteSession?: {
    accessToken: string;
    instanceUrl: string;
    refreshToken: string;
  };
};

export const fetchSalesforceTransaktionenFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as SalesforceTransaktionenInput)
  .handler(async ({ data }): Promise<SalesforceTransaktionenResult> => {
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
          ? searchSalesforceTransaktionen(c.accessToken, c.instanceUrl, search)
          : fetchAllSalesforceTransaktionen(c.accessToken, c.instanceUrl),
    );

    const recommendations = adresse
      ? rankTransaktionenByAdresse(all, adresse)
      : [];

    return {
      recommendations,
      results: all,
      totalLoaded: all.length,
      authSource: creds.source,
      erneuerteSession: creds.erneuert,
    };
  });
