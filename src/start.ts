import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { istOeffentlicherAuthPfad } from "./lib/auth-pfade";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

function istDokumentNavigation(request: Request): boolean {
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") return false;

  const dest = request.headers.get("sec-fetch-dest");
  if (dest && dest !== "document") return false;

  const mode = request.headers.get("sec-fetch-mode");
  if (mode && mode !== "navigate" && mode !== "nested-navigate") return false;

  const accept = request.headers.get("accept") ?? "";
  // Server-Fns / XHR oft application/json oder */* ohne text/html
  if (accept.includes("text/html")) return true;
  // curl / einfache Clients ohne Accept: als Dokument behandeln
  if (!accept) return true;
  return false;
}

/**
 * Geschützte Dokument-Requests serverseitig auf /anmelden umleiten.
 * Session liegt in localStorage — der Server kann sie nicht lesen, daher
 * nie die App-Shell per SSR an Unbekannte ausliefern.
 */
const authRedirectMiddleware = createMiddleware().server(async ({ next, request }) => {
  const url = new URL(request.url);

  if (
    istDokumentNavigation(request) &&
    !istOeffentlicherAuthPfad(url.pathname) &&
    !url.pathname.startsWith("/api/") &&
    !url.pathname.startsWith("/_server") &&
    !url.pathname.includes(".")
  ) {
    const ziel = new URL("/anmelden", url.origin);
    ziel.searchParams.set("von", url.pathname);
    return Response.redirect(ziel, 302);
  }

  return next();
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware, authRedirectMiddleware],
}));
