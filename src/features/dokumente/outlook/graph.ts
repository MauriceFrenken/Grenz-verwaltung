import {
  accountIdFromProfile,
  getValidAccessToken,
  loadStoredAccounts,
  upsertAccount,
} from "./auth";
import { OUTLOOK_MESSAGES_SINCE } from "./config";
import type { OutlookAccount, OutlookMessageSummary, OutlookProfile, OutlookTokens } from "./types";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export const MESSAGE_ID_SEPARATOR = ":";

export function composeMessageId(accountId: string, graphId: string): string {
  return `${accountId}${MESSAGE_ID_SEPARATOR}${graphId}`;
}

export function parseMessageId(messageId: string): { accountId: string; graphId: string } {
  const separatorIndex = messageId.indexOf(MESSAGE_ID_SEPARATOR);
  if (separatorIndex <= 0) {
    throw new Error("Ungültige Nachrichten-ID.");
  }
  return {
    accountId: messageId.slice(0, separatorIndex),
    graphId: messageId.slice(separatorIndex + 1),
  };
}

async function graphFetch<T>(
  accountId: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const accessToken = await getValidAccessToken(accountId);
  if (!accessToken) {
    throw new Error("Outlook ist nicht verbunden.");
  }

  const res = await fetch(`${GRAPH_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    let message = `Microsoft Graph Fehler (${res.status})`;
    try {
      const json = (await res.json()) as { error?: { message?: string } };
      if (json.error?.message) message = json.error.message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  if (res.status === 204 || res.status === 202) return undefined as T;

  const text = await res.text();
  if (!text.trim()) return undefined as T;
  return JSON.parse(text) as T;
}

export async function fetchOutlookProfileWithToken(accessToken: string): Promise<OutlookProfile> {
  const res = await fetch(`${GRAPH_BASE}/me?$select=displayName,mail,userPrincipalName`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`Microsoft Graph Fehler (${res.status})`);
  }

  const me = (await res.json()) as {
    displayName?: string;
    mail?: string;
    userPrincipalName?: string;
  };

  return {
    displayName: me.displayName ?? "Unbekannt",
    mail: me.mail ?? me.userPrincipalName ?? "",
    userPrincipalName: me.userPrincipalName ?? "",
  };
}

export async function fetchOutlookProfile(accountId: string): Promise<OutlookProfile> {
  const me = await graphFetch<{
    displayName?: string;
    mail?: string;
    userPrincipalName?: string;
  }>(accountId, "/me?$select=displayName,mail,userPrincipalName");

  return {
    displayName: me.displayName ?? "Unbekannt",
    mail: me.mail ?? me.userPrincipalName ?? "",
    userPrincipalName: me.userPrincipalName ?? "",
  };
}

function resolveAccounts(accountIds?: string[]): OutlookAccount[] {
  const accounts = loadStoredAccounts();
  if (!accountIds) return accounts;
  if (accountIds.length === 0) return [];
  const allowed = new Set(accountIds);
  return accounts.filter((account) => allowed.has(account.id));
}

function mapGraphMessage(
  accountId: string,
  m: {
    id: string;
    subject?: string;
    isRead?: boolean;
    hasAttachments?: boolean;
    receivedDateTime?: string;
    from?: { emailAddress?: { address?: string; name?: string } };
  },
  attachmentNames: string[] = [],
): OutlookMessageSummary {
  const senderMail = m.from?.emailAddress?.address ?? "";
  return {
    id: composeMessageId(accountId, m.id),
    graphId: m.id,
    accountId,
    subject: m.subject ?? "(Kein Betreff)",
    from: m.from?.emailAddress?.name ?? (senderMail || "Unbekannt"),
    senderMail,
    receivedAt: m.receivedDateTime ?? "",
    isRead: Boolean(m.isRead),
    hasAttachments: Boolean(m.hasAttachments),
    attachmentNames,
  };
}

async function fetchAttachmentNames(accountId: string, graphId: string): Promise<string[]> {
  try {
    const att = await graphFetch<{
      value?: { name?: string; contentType?: string; size?: number }[];
    }>(accountId, `/me/messages/${encodeURIComponent(graphId)}/attachments?$select=name,contentType,size`);

    return (att.value ?? [])
      .filter((a) => a.name && a.contentType)
      .map((a) => a.name as string);
  } catch {
    return [];
  }
}

async function fetchRecentMessagesForAccount(
  accountId: string,
  limit: number,
): Promise<OutlookMessageSummary[]> {
  const query = new URLSearchParams({
    $top: String(limit),
    $orderby: "receivedDateTime desc",
    $select: "id,subject,isRead,hasAttachments,receivedDateTime,from",
    $filter: `receivedDateTime ge ${OUTLOOK_MESSAGES_SINCE} and hasAttachments eq true`,
  });

  const data = await graphFetch<{
    value?: {
      id: string;
      subject?: string;
      isRead?: boolean;
      hasAttachments?: boolean;
      receivedDateTime?: string;
      from?: { emailAddress?: { address?: string; name?: string } };
    }[];
  }>(accountId, `/me/mailFolders/inbox/messages?${query}`);

  const messages = data.value ?? [];
  const enriched = await Promise.all(
    messages.map(async (message) => {
      const names = await fetchAttachmentNames(accountId, message.id);
      return mapGraphMessage(accountId, message, names);
    }),
  );

  return enriched;
}

export async function fetchRecentMessagesWithAttachments(
  limit = 50,
  accountIds?: string[],
): Promise<OutlookMessageSummary[]> {
  const accounts = resolveAccounts(accountIds);
  if (accounts.length === 0) return [];

  const perAccountLimit = Math.max(limit, 10);
  const batches = await Promise.all(
    accounts.map(async (account) => {
      try {
        return await fetchRecentMessagesForAccount(account.id, perAccountLimit);
      } catch {
        return [];
      }
    }),
  );

  return batches
    .flat()
    .sort((a, b) => {
      const aTime = a.receivedAt ? Date.parse(a.receivedAt) : 0;
      const bTime = b.receivedAt ? Date.parse(b.receivedAt) : 0;
      return bTime - aTime;
    })
    .slice(0, limit);
}

function htmlToText(content: string): string {
  return content
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ANALYSABLE_ATTACHMENT_TYPES = /^(image\/(jpeg|jpg|png|gif|webp)|application\/pdf)$/i;
const MAX_ATTACHMENT_BYTES = 4_000_000;
const MIN_IMAGE_BYTES = 8_000;
const MAX_ATTACHMENTS = 3;
const MAX_BODY_CHARS = 4_000;

export type AnalysisAttachment = {
  name: string;
  contentType: string;
  dataBase64: string;
};

export type MessageAnalysisInput = {
  subject: string;
  from: string;
  text: string;
  attachments: AnalysisAttachment[];
  anhangName: string | null;
  anhangContentType: string | null;
};

export async function fetchMessageForAnalysis(messageId: string): Promise<MessageAnalysisInput> {
  const { accountId, graphId } = parseMessageId(messageId);
  const data = await graphFetch<{
    subject?: string;
    bodyPreview?: string;
    hasAttachments?: boolean;
    from?: { emailAddress?: { address?: string; name?: string } };
    body?: { contentType?: string; content?: string };
  }>(
    accountId,
    `/me/messages/${encodeURIComponent(graphId)}?$select=subject,bodyPreview,hasAttachments,from,body`,
  );

  let text = "";
  const content = data.body?.content ?? "";
  if (data.body?.contentType === "html") {
    text = htmlToText(content);
  } else if (content.trim()) {
    text = content.trim();
  } else {
    text = data.bodyPreview?.trim() ?? "";
  }
  if (text.length > MAX_BODY_CHARS) {
    text = `${text.slice(0, MAX_BODY_CHARS)} …`;
  }

  const senderMail = data.from?.emailAddress?.address ?? "";
  const from = data.from?.emailAddress?.name ?? (senderMail || "Unbekannt");

  let attachments: AnalysisAttachment[] = [];
  let anhangName: string | null = null;
  let anhangContentType: string | null = null;

  if (data.hasAttachments) {
    try {
      const att = await graphFetch<{
        value?: {
          "@odata.type"?: string;
          name?: string;
          contentType?: string;
          size?: number;
          isInline?: boolean;
          contentBytes?: string;
        }[];
      }>(accountId, `/me/messages/${encodeURIComponent(graphId)}/attachments`);

      attachments = (att.value ?? [])
        .filter((a) => {
          if (!a.contentBytes || !a.contentType) return false;
          if (!ANALYSABLE_ATTACHMENT_TYPES.test(a.contentType)) return false;
          const size = a.size ?? 0;
          if (size > MAX_ATTACHMENT_BYTES) return false;
          if (/^image\//i.test(a.contentType) && a.isInline && size < MIN_IMAGE_BYTES) {
            return false;
          }
          return true;
        })
        .slice(0, MAX_ATTACHMENTS)
        .map((a) => ({
          name: a.name ?? "anhang",
          contentType: a.contentType as string,
          dataBase64: a.contentBytes as string,
        }));

      if (attachments[0]) {
        anhangName = attachments[0].name;
        anhangContentType = attachments[0].contentType;
      }
    } catch {
      /* attachments are best-effort */
    }
  }

  return {
    subject: data.subject ?? "(Kein Betreff)",
    from,
    text,
    attachments,
    anhangName,
    anhangContentType,
  };
}

export async function completeOutlookAccountConnection(
  tokens: OutlookTokens,
): Promise<OutlookAccount> {
  const profile = await fetchOutlookProfileWithToken(tokens.accessToken);
  const account: OutlookAccount = {
    id: accountIdFromProfile(profile),
    tokens,
    profile,
  };
  upsertAccount(account);
  return account;
}
