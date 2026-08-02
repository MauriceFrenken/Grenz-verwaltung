/**
 * Fehlermeldung aus einem beliebigen Wurf lesen. Server-Fns liefern je nach
 * Fehlerquelle eine Error-Instanz oder ein einfaches Objekt mit `message` —
 * ohne diese Normalisierung landet der User bei einer nichtssagenden
 * Standardmeldung.
 */
export function salesforceFehlerText(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.trim()) return err.message;
  if (typeof err === "string" && err.trim()) return err;

  if (err && typeof err === "object") {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;

    const error = (err as { error?: unknown }).error;
    if (typeof error === "string" && error.trim()) return error;
  }

  return fallback;
}
