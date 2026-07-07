import { createServerFn } from "@tanstack/react-start";

import { handleAnalyzeExposeRequest, type AnalyzeExposeRequest } from "@/lib/expose-ai";

export const analyzeExposeFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as AnalyzeExposeRequest)
  .handler(async ({ data }) => handleAnalyzeExposeRequest(data));
