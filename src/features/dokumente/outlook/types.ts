export type OutlookTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
  scope: string;
};

export type OutlookProfile = {
  displayName: string;
  mail: string;
  userPrincipalName: string;
};

export type OutlookAccount = {
  id: string;
  tokens: OutlookTokens;
  profile: OutlookProfile | null;
};

export type OutlookConnectionState = {
  connected: boolean;
  configured: boolean;
  accounts: OutlookAccount[];
  loading: boolean;
  error: string | null;
  profileError: string | null;
};

export type OutlookMessageSummary = {
  id: string;
  graphId: string;
  accountId: string;
  subject: string;
  from: string;
  senderMail: string;
  receivedAt: string;
  isRead: boolean;
  hasAttachments: boolean;
  attachmentNames: string[];
};

export type PosteingangAnalyseStatus = {
  nachrichtId: string;
  status: "neu" | "analysiert" | "abgelegt" | "in_pruefung" | "abgelehnt";
  kategorieName: string | null;
  mandantId: string | null;
  objektId: string | null;
  dateiname: string | null;
  konfidenz: number | null;
};
