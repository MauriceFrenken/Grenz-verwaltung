import { createServerFn } from "@tanstack/react-start";

import {
  salesforceObjektRechte,
  type SalesforceObjektRechte,
} from "./describe";
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
  /** Stadt aus dem Exposé — für Matching gegen Salesforce City__c */
  city?: string;
  /** PLZ aus dem Exposé — für Matching gegen Salesforce ZIP_Code__c */
  zip?: string;
  /** Freitext-Suche in Salesforce */
  search?: string;
  /** Objektrechte des Users mitliefern (nur beim ersten Laden nötig). */
  mitRechten?: boolean;
};

export type SalesforceObjekteResult = {
  recommendations: SalesforceObjektMatch[];
  results: SalesforceObjekt[];
  totalLoaded: number;
  authSource: "env" | "session";
  /** Darf der User in Salesforce Objekte anlegen/ändern? */
  rechte?: SalesforceObjektRechte | null;
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
    const city = data.city?.trim() ?? "";
    const zip = data.zip?.trim() ?? "";
    const ort = city || zip ? { city: city || null, zip: zip || null } : undefined;

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

    const recommendations = adresse
      ? rankObjekteByAdresse(all, adresse, ort)
      : [];
    const rechte = data.mitRechten
      ? await salesforceObjektRechte(
          creds.accessToken,
          creds.instanceUrl,
          "Real_Estate__c",
        )
      : undefined;

    return {
      recommendations,
      results: all,
      totalLoaded: all.length,
      authSource: creds.source,
      rechte,
      erneuerteSession: creds.erneuert,
    };
  });
