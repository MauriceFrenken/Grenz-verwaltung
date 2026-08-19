export type GraphMe = {
  id: string;
  mail: string | null;
  userPrincipalName: string | null;
  displayName: string | null;
};

export async function graphMe(accessToken: string): Promise<GraphMe> {
  const res = await fetch("https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName,displayName", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = (await res.json().catch(() => ({}))) as {
    id?: string;
    mail?: string;
    userPrincipalName?: string;
    displayName?: string;
    error?: { message?: string };
  };
  if (!res.ok || !data.id) {
    throw new Error(data.error?.message || `Microsoft Graph /me fehlgeschlagen (HTTP ${res.status})`);
  }
  return {
    id: data.id,
    mail: data.mail ?? null,
    userPrincipalName: data.userPrincipalName ?? null,
    displayName: data.displayName ?? null,
  };
}

export function kontoAusGraphMe(me: GraphMe): string {
  return (me.mail || me.userPrincipalName || "").trim().toLowerCase();
}
