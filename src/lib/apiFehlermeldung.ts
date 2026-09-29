import type { PostgrestError } from "@supabase/supabase-js";

// Grossbuchstaben sind erlaubt, damit die Kuerzel der Quelldaten (G-01, APO-01) direkt als ID dienen.
const SLUG_REGEX_GESELLSCHAFT = /^[A-Za-z][A-Za-z0-9_-]{1,48}$/;
const SLUG_REGEX_OBJEKT = /^[A-Za-z][A-Za-z0-9_-]{1,63}$/;

export function istGueltigeSlugId(value: string, art: "gesellschaft" | "objekt" = "gesellschaft"): boolean {
  return art === "objekt" ? SLUG_REGEX_OBJEKT.test(value) : SLUG_REGEX_GESELLSCHAFT.test(value);
}

export function slugAusText(
  text: string,
  maxLength = 48,
  art: "gesellschaft" | "objekt" = "gesellschaft",
): string {
  const slug = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);

  if (!slug) return "eintrag";
  return istGueltigeSlugId(slug, art) ? slug : `x-${slug}`.slice(0, maxLength);
}

export function apiFehlermeldung(error: unknown): string {
  if (!error) return "Unbekannter Fehler";

  if (error instanceof Error) {
    const msg = error.message;

    if (/keine berechtigung/i.test(msg)) {
      return "Sie haben keine Berechtigung für diese Aktion.";
    }
    if (/row-level security|rls|42501|insufficient_privilege|permission denied/i.test(msg)) {
      return "Sie haben keine Berechtigung für diese Aktion.";
    }
    if (/duplicate key|already exists|23505|existiert bereits/i.test(msg)) {
      return /sollstellung|monat/i.test(msg)
        ? "Für diesen Monat existiert bereits eine Sollstellung."
        : "Ein Eintrag mit dieser ID existiert bereits.";
    }
    if (/already been registered|already registered|user already/i.test(msg)) {
      return "Diese E-Mail ist bereits registriert. Nutzen Sie „Passwort vergessen“ auf der Anmeldeseite.";
    }
    if (/rate limit|too many requests|429/i.test(msg)) {
      return "Zu viele E-Mails in kurzer Zeit. Bitte warten Sie einige Minuten und versuchen Sie es erneut.";
    }
    if (/foreign key|23503|nicht gefunden/i.test(msg)) {
      return "Verknüpfte Daten fehlen oder sind ungültig.";
    }
    if (/violates check constraint|id_format/i.test(msg)) {
      return "Ungültige ID — nur Buchstaben, Zahlen, Bindestrich und Unterstrich (z. B. G-06).";
    }

    if (/timed out|timeout|504|Task timed out/i.test(msg)) {
      return "Zeitüberschreitung — bitte erneut versuchen.";
    }
    if (/Noch nicht initialisiert|Zuerst Initialisieren/i.test(msg)) {
      return msg;
    }

    return msg;
  }

  const pg = error as PostgrestError;
  if (pg?.message) return apiFehlermeldung(new Error(pg.message));

  return "Unbekannter Fehler";
}
