/**
 * Rechnungsfreigabe-Kanban: laden, Status verschieben, DATEV bei Drop.
 * Server-only.
 */
import { microsoftCallerAusJwt } from "@/lib/microsoft/supabase-admin";

import { dokumentPosteingangBuchen } from "./buchen";
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
} from "./typen";

const VERSCHIEBBARE: DokumentFreigabeStatus[] = [
  "neu",
  "in_pruefung",
  "freigegeben",
];

function istRechnung(row: {
  dokument_typ: string | null;
  ist_rechnung: boolean | null;
}): boolean {
  return row.dokument_typ === "rechnung" || row.ist_rechnung === true;
}

function normalisiereFreigabe(
  raw: string | null | undefined,
  status: string,
): DokumentFreigabeStatus {
  if (status === "gebucht") return "erledigt";
  if (
    raw === "neu" ||
    raw === "in_pruefung" ||
    raw === "freigegeben" ||
    raw === "an_datev" ||
    raw === "erledigt"
  ) {
    return raw;
  }
  return "neu";
}

export async function dokumentRechnungsfreigabeLaden(input: {
  supabaseAccessToken: string;
}): Promise<DokumentPosteingangEintrag[]> {
  await microsoftCallerAusJwt(input.supabaseAccessToken);
  const rows = await leseRechnungsfreigabe();

  const offen: DokumentPosteingangEintrag[] = [];
  const erledigt: DokumentPosteingangEintrag[] = [];

  for (const r of rows) {
    if (!istRechnung(r)) continue;
    const eintrag: DokumentPosteingangEintrag = {
      ...zuEintrag(r),
      freigabeStatus: normalisiereFreigabe(r.freigabe_status, r.status),
    };
    if (r.status === "gebucht" || r.freigabe_status === "erledigt") {
      erledigt.push(eintrag);
    } else {
      offen.push(eintrag);
    }
  }

  return [...offen, ...erledigt.slice(0, 40)];
}

export async function dokumentRechnungsfreigabeZaehlen(input: {
  supabaseAccessToken: string;
}): Promise<{ offen: number }> {
  await microsoftCallerAusJwt(input.supabaseAccessToken);
  return { offen: await zaehleOffeneRechnungsfreigabe() };
}

export async function dokumentRechnungsfreigabeVerschieben(input: {
  supabaseAccessToken: string;
  eintragId: string;
  freigabeStatus: DokumentFreigabeStatus;
}): Promise<
  | { eintrag: DokumentPosteingangEintrag; gebucht?: undefined }
  | { eintrag: DokumentPosteingangEintrag; gebucht: DokumentBuchenErgebnis }
> {
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

  if (ziel === "erledigt") {
    throw new Error("Erledigt wird nur nach erfolgreichem DATEV-Versand gesetzt.");
  }

  if (ziel === "an_datev") {
    await setzeFreigabeStatus(id, "an_datev");
    try {
      const gebucht = await dokumentPosteingangBuchen({
        supabaseAccessToken: input.supabaseAccessToken,
        eintragId: id,
        gesellschaftId: row.gesellschaft_id,
        objektId: row.objekt_id,
        felder: row.felder,
      });
      const aktualisiert = await leseEintrag(id);
      return {
        eintrag: {
          ...zuEintrag(aktualisiert),
          freigabeStatus: "erledigt",
        },
        gebucht,
      };
    } catch (err) {
      await setzeFreigabeStatus(
        id,
        normalisiereFreigabe(row.freigabe_status, row.status) === "an_datev"
          ? "in_pruefung"
          : normalisiereFreigabe(row.freigabe_status, row.status),
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
    eintrag: {
      ...zuEintrag(aktualisiert),
      freigabeStatus: ziel,
    },
  };
}
