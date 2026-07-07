import { useQuery } from "@tanstack/react-query";

import { fetchRecentMessagesWithAttachments } from "./graph";

export { OutlookConnectionProvider, useOutlookConnection } from "./OutlookConnectionProvider";

export const OUTLOOK_MESSAGES_KEY = ["outlook", "messages", "attachments"] as const;

export function useOutlookMessagesQuery(
  limit = 50,
  enabled = true,
  accountIds: string[] = [],
) {
  return useQuery({
    queryKey: [...OUTLOOK_MESSAGES_KEY, limit, accountIds],
    queryFn: () => fetchRecentMessagesWithAttachments(limit, accountIds),
    enabled: enabled && accountIds.length > 0,
    staleTime: 60_000,
  });
}
