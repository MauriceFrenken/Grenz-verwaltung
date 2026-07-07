import type { PostgrestError } from "@supabase/supabase-js";

const SLUG_REGEX_MANDANT = /^[a-z][a-z0-9_-]{1,48}$/;
const SLUG_REGEX_OBJEKT = /^[a-z][a-z0-9_-]{1,63}$/;

export function istGueltigeSlugId(value: string, art: "mandant" | "objekt" = "mandant"): boolean {
  return art === "objekt" ? SLUG_REGEX_OBJEKT.test(value) : SLUG_REGEX_MANDANT.test(value);
}

export function slugAusText(
  text: string,
  maxLength = 48,
  art: "mandant" | "objekt" = "mandant",
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
    if (/duplicate key|already exists|23505/i.test(msg)) {
      return "Ein Eintrag mit dieser ID existiert bereits.";
    }
    if (/foreign key|23503|nicht gefunden/i.test(msg)) {
      return "Verknüpfte Daten fehlen oder sind ungültig.";
    }
    if (/violates check constraint|id_format/i.test(msg)) {
      return "Ungültige ID — nur Kleinbuchstaben, Zahlen, Bindestrich und Unterstrich (z. B. frenken-holding).";
    }

    return msg;
  }

  const pg = error as PostgrestError;
  if (pg?.message) return apiFehlermeldung(new Error(pg.message));

  return "Unbekannter Fehler";
}
