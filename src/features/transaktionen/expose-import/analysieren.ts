import { analyzeExposeFn } from "./analyze-fn";
import type { AnalyzeExposeRequest, AnalyzeExposeResponse } from "@/lib/expose-ai";

const ANALYZE_API = "/api/analyze-expose";

export async function analysiereExpose(body: AnalyzeExposeRequest): Promise<AnalyzeExposeResponse> {
  const res = await fetch(ANALYZE_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (res.ok) {
    return (await res.json()) as AnalyzeExposeResponse;
  }

  if (res.status === 404 || res.status === 405) {
    return analyzeExposeFn({ data: body });
  }

  let message = `KI-Analyse fehlgeschlagen (${res.status})`;
  try {
    const json = (await res.json()) as { error?: string };
    if (json.error) message = json.error;
  } catch {
    /* ignore */
  }
  throw new Error(message);
}
