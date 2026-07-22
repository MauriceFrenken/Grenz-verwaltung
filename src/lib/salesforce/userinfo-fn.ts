import { createServerFn } from "@tanstack/react-start";

export type SalesforceUserInfoInput = {
  accessToken: string;
  instanceUrl: string;
};

export type SalesforceUserInfoResult = {
  userId: string;
  organizationId: string;
  preferredUsername: string;
  displayName: string;
  email: string | null;
};

export const fetchSalesforceUserInfoFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as SalesforceUserInfoInput)
  .handler(async ({ data }) => {
    const accessToken = data.accessToken?.trim();
    const instanceUrl = data.instanceUrl?.trim().replace(/\/$/, "");
    if (!accessToken || !instanceUrl) {
      throw new Error("accessToken und instanceUrl sind erforderlich.");
    }

    const res = await fetch(`${instanceUrl}/services/oauth2/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const raw = (await res.json().catch(() => ({}))) as {
      user_id?: string;
      organization_id?: string;
      preferred_username?: string;
      name?: string;
      email?: string;
      error?: string;
      error_description?: string;
    };

    if (!res.ok) {
      throw new Error(
        raw.error_description || raw.error || `Userinfo fehlgeschlagen (${res.status})`,
      );
    }

    return {
      userId: raw.user_id ?? "",
      organizationId: raw.organization_id ?? "",
      preferredUsername: raw.preferred_username ?? "",
      displayName: raw.name ?? raw.preferred_username ?? "Salesforce-User",
      email: raw.email ?? null,
    } satisfies SalesforceUserInfoResult;
  });
