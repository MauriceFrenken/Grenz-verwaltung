import { createServerFn } from "@tanstack/react-start";

import { handleAnalyzeDokumentRequest, type AnalyzeDokumentRequest } from "@/lib/email-ai";

export const analyzeDokumentFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as AnalyzeDokumentRequest)
  .handler(async ({ data }) => handleAnalyzeDokumentRequest(data));
