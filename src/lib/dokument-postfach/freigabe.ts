/**
 * Rechnungsfreigabe-Kanban: laden, Status verschieben, DATEV bei Drop.
 * Server-only.
 */
import { microsoftCallerAusJwt } from "@/lib/microsoft/supabase-admin";

import { dokumentPosteingangBuchen } from "./buchen";
import { leseRechnungsHistorie } from "./rechnung-historie";
import {
  leseEintrag,
  leseRechnungsfreigabe,
  setzeFreigabeStatus,
  zaehleOffeneRechnungsfreigabe,
  zuEintrag,
} from "./store";
import type {
  DokumentBuchenErgebnis,
  DokumentFreigabeStatus,
  DokumentPosteingangEintrag,
  DokumentRechnungsfreigabe,
} from "./typen";

const VERSCHIEBBARE: DokumentFreigabeStatus[] = ["neu", "in_pruefung"];

function istRechnung(row: {
  dokument_typ: string | null;
  ist_rechnung: boolean | null;
}): boolean {
  return row.dokument_typ === "rechnung" || row.ist_rechnung === true;
}

/** Board-Status: Freigegeben → In Prüfung; Erledigt nicht auf dem Board. */
function normalisiereFreigabe(
  raw: string | null | undefined,
  status: string,
): DokumentFreigabeStatus | null {
  if (status === "gebucht" || raw === "erledigt") return null;
  if (raw === "freigegeben") return "in_pruefung";
  if (raw === "neu" || raw === "in_pruefung" || raw === "an_datev") {
    return raw;
  }
  return "neu";
}

export async function dokumentRechnungsfreigabeLaden(input: {
  supabaseAccessToken: string;
}): Promise<DokumentRechnungsfreigabe> {
  await microsoftCallerAusJwt(input.supabaseAccessToken);
  const [rows, historie] = await Promise.all([
    leseRechnungsfreigabe(),
    leseRechnungsHistorie(),
  ]);
  const offen: DokumentPosteingangEintrag[] = [];

  for (const r of rows) {
    if (!istRechnung(r)) continue;
    if (r.status === "gebucht") continue;
    const freigabeStatus = normalisiereFreigabe(r.freigabe_status, r.status);
    if (!freigabeStatus || freigabeStatus === "erledigt") continue;
    offen.push({
      ...zuEintrag(r),
      freigabeStatus,
    });
  }

  return { eintraege: offen, historie };
}

export async function dokumentRechnungsfreigabeZaehlen(input: {
  supabaseAccessToken: string;
}): Promise<{ offen: number }> {
  await microsoftCallerAusJwt(input.supabaseAccessToken);
  return { offen: await zaehleOffeneRechnungsfreigabe() };
}

export type FreigabeVerschiebenErgebnis =
  | { entfernt: false; eintrag: DokumentPosteingangEintrag }
  | {
      entfernt: true;
      eintragId: string;
      gebucht: DokumentBuchenErgebnis;
    };

export async function dokumentRechnungsfreigabeVerschieben(input: {
  supabaseAccessToken: string;
  eintragId: string;
  freigabeStatus: DokumentFreigabeStatus;
}): Promise<FreigabeVerschiebenErgebnis> {
  await microsoftCallerAusJwt(input.supabaseAccessToken);

  const id = input.eintragId?.trim();
  if (!id) throw new Error("eintragId ist erforderlich.");

  const ziel = input.freigabeStatus;
  const row = await leseEintrag(id);
  if (!istRechnung(row)) {
    throw new Error("Nur Rechnungen können in der Freigabe verschoben werden.");
  }
  if (row.status === "gebucht" || row.freigabe_status === "erledigt") {
    throw new Error("Diese Rechnung ist bereits erledigt.");
  }

  if (ziel === "erledigt" || ziel === "freigegeben") {
    throw new Error("Ungültiger Freigabe-Status.");
  }

  if (ziel === "an_datev") {
    await setzeFreigabeStatus(id, "an_datev");
    try {
      const gebucht = await dokumentPosteingangBuchen({
        supabaseAccessToken: input.supabaseAccessToken,
        eintragId: id,
        gesellschaftId: row.gesellschaft_id,
        felder: row.felder,
      });
      // Nach Buchung + Mail-Abschluss ist der Eintrag oft gelöscht — vom Board entfernen
      return { entfernt: true, eintragId: id, gebucht };
    } catch (err) {
      const zurueck =
        normalisiereFreigabe(row.freigabe_status, row.status) ?? "in_pruefung";
      await setzeFreigabeStatus(
        id,
        zurueck === "an_datev" ? "in_pruefung" : zurueck,
      );
      throw err;
    }
  }

  if (!VERSCHIEBBARE.includes(ziel)) {
    throw new Error("Ungültiger Freigabe-Status.");
  }

  await setzeFreigabeStatus(id, ziel);
  const aktualisiert = await leseEintrag(id);
  return {
    entfernt: false,
    eintrag: {
      ...zuEintrag(aktualisiert),
      freigabeStatus: ziel,
    },
  };
}
