/**
 * Verschiebt die Outlook-Mail in den Gesellschafts-Unterordner erst,
 * wenn alle Anhänge derselben Nachricht erledigt sind. Server-only.
 */
import {
  graphNachrichtVerschieben,
  graphPosteingangGesellschaftsOrdner,
} from "@/lib/microsoft/graph";
import { microsoftAccessToken } from "@/lib/microsoft/postfach";
import { createServiceRoleClient } from "@/lib/microsoft/supabase-admin";

import {
  istEintragErledigt,
  leseEintraegeFuerNachricht,
  loescheEintraegeFuerNachricht,
  type DokumentPosteingangRow,
} from "./store";
import type { DokumentMailAbschluss } from "./typen";

async function gesellschaftNameAusId(
  gesellschaftId: string | null,
): Promise<string | null> {
  if (!gesellschaftId?.trim()) return null;
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("gesellschaften")
    .select("name")
    .eq("id", gesellschaftId)
    .maybeSingle();
  if (error) {
    throw new Error(`Gesellschaft konnte nicht geladen werden: ${error.message}`);
  }
  return (data?.name as string | null)?.trim() || null;
}

function nameAusFeldern(row: DokumentPosteingangRow): string | null {
  const ausFeld = row.felder?.gesellschaftName?.value?.trim();
  return ausFeld || null;
}

/** Ziel-Ordnername im E-Mail-Posteingang für diese Nachricht. */
export async function ermittleMailOrdnerName(
  rows: DokumentPosteingangRow[],
  bevorzugt?: DokumentPosteingangRow,
): Promise<string> {
  const kandidaten = bevorzugt ? [bevorzugt, ...rows] : rows;

  for (const row of kandidaten) {
    const ausId = await gesellschaftNameAusId(row.gesellschaft_id);
    if (ausId) return ausId;
    const ausFeld = nameAusFeldern(row);
    if (ausFeld) return ausFeld;
  }

  throw new Error(
    "Kein Gesellschaftsordner ermittelbar — bitte zuerst eine Gesellschaft zuordnen.",
  );
}

/**
 * Wenn alle Anhänge abgelegt/gebucht sind: Mail in Gesellschafts-Unterordner
 * verschieben und DB-Einträge entfernen. Sonst nur Status belassen.
 */
export async function schliesseNachrichtAbWennFertig(input: {
  postfach: string;
  graphNachrichtId: string;
  /** Eintrag, der gerade erledigt wurde — steuert die Ordnerwahl bei gemischten Mails. */
  bevorzugterEintrag?: DokumentPosteingangRow;
}): Promise<DokumentMailAbschluss> {
  const siblings = await leseEintraegeFuerNachricht(
    input.postfach,
    input.graphNachrichtId,
  );

  if (siblings.length === 0) {
    return {
      mailVerschoben: false,
      mailOrdner: null,
      postfach: input.postfach,
      graphNachrichtId: input.graphNachrichtId,
    };
  }

  const offen = siblings.filter((s) => !istEintragErledigt(s.status));
  if (offen.length > 0) {
    return {
      mailVerschoben: false,
      mailOrdner: null,
      postfach: input.postfach,
      graphNachrichtId: input.graphNachrichtId,
    };
  }

  const ordnerName = await ermittleMailOrdnerName(
    siblings,
    input.bevorzugterEintrag,
  );
  const { accessToken } = await microsoftAccessToken();
  const ordner = await graphPosteingangGesellschaftsOrdner(
    accessToken,
    input.postfach,
    ordnerName,
  );

  await graphNachrichtVerschieben(
    accessToken,
    input.postfach,
    input.graphNachrichtId,
    ordner.id,
  );
  await loescheEintraegeFuerNachricht(input.postfach, input.graphNachrichtId);

  return {
    mailVerschoben: true,
    mailOrdner: ordner.name,
    postfach: input.postfach,
    graphNachrichtId: input.graphNachrichtId,
  };
}
