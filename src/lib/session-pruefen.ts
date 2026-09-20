import type { Session, User } from "@supabase/supabase-js";
import { benutzerAusUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import type { Benutzer } from "@/types";

export type GepruefteSession =
  | { ok: true; session: Session; user: User; benutzer: Benutzer }
  | { ok: false };

/**
 * Bestätigt die Session serverseitig via getUser().
 * Ohne Argument: liest zuerst die lokale Session.
 * Ungültige Tokens werden lokal verworfen — kein App-Shell-Flash.
 */
export async function sessionServerseitigPruefen(
  vorhandeneSession?: Session | null,
): Promise<GepruefteSession> {
  let session: Session | null;

  if (vorhandeneSession === undefined) {
    const { data } = await supabase.auth.getSession();
    session = data.session;
  } else {
    session = vorhandeneSession;
  }

  if (!session?.access_token) {
    return { ok: false };
  }

  const { data, error } = await supabase.auth.getUser(session.access_token);
  if (error || !data.user) {
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // lokal verwerfen reicht
    }
    return { ok: false };
  }

  return {
    ok: true,
    session,
    user: data.user,
    benutzer: benutzerAusUser(data.user),
  };
}
