/** Salesforce-Zugang für Server-Funktionen: Connected App (JWT), sonst die Sitzung des Nutzers, sonst die hinterlegte Verbindung. */

import { resolveVerifiedSalesforceCredentials } from "@/lib/salesforce/server-credentials";

import { jwtZugangKonfiguriert, mitSfZugang } from "./jwt";

export type SfSitzung = {
  accessToken?: string;
  instanceUrl?: string;
  refreshToken?: string;
};

export function sfSitzungAus(data: unknown): SfSitzung | null {
  const s = (data as { sfSitzung?: unknown } | null)?.sfSitzung;
  return s && typeof s === "object" ? (s as SfSitzung) : null;
}

/** Schreibvorgänge laufen so unter dem Namen des Nutzers; ohne seine Sitzung greift sfServerZugang (hinterlegte Verbindung). */
export async function mitSfZugangOderSitzung<T>(
  sfSitzung: SfSitzung | null,
  lauf: () => Promise<T>,
): Promise<T> {
  if (!jwtZugangKonfiguriert() && sfSitzung?.accessToken) {
    const creds = await resolveVerifiedSalesforceCredentials(sfSitzung);
    return mitSfZugang(
      {
        accessToken: creds.accessToken,
        instanceUrl: creds.instanceUrl,
        quelle: "sitzung",
      },
      lauf,
    );
  }
  return lauf();
}
