// Basis-API-Client. Kapselt fetch mit typisierten Fehlern und Auth-Header-Platzhalter.
// Wird von den API-Modulen (verwaltung, dokumente, transaktionen, einstellungen)
// genutzt. Solange keine echten Endpunkte verbunden sind, werfen die Modul-
// Funktionen NotImplementedError oder liefern leere typisierte Antworten.

import { ApiError } from "@/lib/errors";
import { useAuthStore } from "@/store/auth";

const BASE_URL =
  (typeof import.meta !== "undefined" && (import.meta as { env?: { VITE_API_BASE_URL?: string } }).env?.VITE_API_BASE_URL) ||
  "";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface RequestOptions {
  method?: Method;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

function getAuthToken(): string | null {
  return useAuthStore.getState().session?.access_token ?? null;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const base = BASE_URL.replace(/\/$/, "");
  const url = new URL(`${base}${path}`, base || "http://placeholder");
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }
  }
  return base ? url.toString() : `${path}${url.search}`;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(buildUrl(path, options.query), {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  if (!res.ok) {
    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      /* ignore */
    }
    throw new ApiError(`API-Fehler ${res.status}`, res.status, payload);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = { request: apiRequest };