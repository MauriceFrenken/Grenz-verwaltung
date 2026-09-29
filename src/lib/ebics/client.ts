/**
 * EBICS-Protokoll (INI/HIA/HPB/C53) — nur bei Bedarf laden.
 * ebics-client wird per dynamischem Import gebündelt (kein createRequire).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BankLetter as BankLetterType,
  Client as ClientType,
  Orders as OrdersType,
} from "ebics-client";

// Force-bundle nested CJS deps that ebics-client requires at runtime.
import "asn1";
import "node-rsa";
import "node-forge";

import { ebicsMasterKey } from "./config";
import { EBICS_INI_BRIEF_DE } from "./ini-brief-de";
import type { EbicsKundeRow } from "./kunden";
import { createDbKeyStorage } from "./key-storage";

export type { EbicsKundeRow };
export { loadEbicsKunden } from "./kunden";

type EbicsPkg = {
  Client: new (opts: ConstructorParameters<typeof ClientType>[0]) => ClientType;
  Orders: typeof OrdersType;
  BankLetter: new (opts: {
    client: ClientType;
    bankName: string;
    template: string;
  }) => BankLetterType;
};

let ebicsPkgPromise: Promise<EbicsPkg> | null = null;

async function loadEbicsPkg(): Promise<EbicsPkg> {
  if (!ebicsPkgPromise) {
    ebicsPkgPromise = import("ebics-client").then((mod) => {
      const m = mod as EbicsPkg & { default?: EbicsPkg };
      return (m.default ?? m) as EbicsPkg;
    });
  }
  return ebicsPkgPromise;
}

async function createEbicsClient(
  admin: SupabaseClient,
  kunde: EbicsKundeRow,
): Promise<ClientType> {
  const { Client } = await loadEbicsPkg();
  // Kein IV: ebics-client decrypted intern immer ohne IV.
  return new Client({
    url: kunde.url,
    partnerId: kunde.partner_id,
    userId: kunde.user_id,
    hostId: kunde.host_id,
    passphrase: ebicsMasterKey(),
    keyStorage: createDbKeyStorage(admin, kunde.id),
    bankName: kunde.bank_name,
    bankShortName: kunde.partner_id,
    languageCode: "de",
  });
}

/** Kaputte/alte Schlüsselblobs löschen, damit Init sauber neu starten kann. */
export async function ebicsSchluesselZuruecksetzen(
  admin: SupabaseClient,
  kundeId: string,
): Promise<void> {
  await admin.from("ebics_schluessel").delete().eq("ebics_kunde_id", kundeId);
}

function assertTechnicalOk(res: {
  technicalCodeSymbol?: string;
  technicalCodeShortText?: string;
  technicalCode?: string;
}) {
  const sym = (res.technicalCodeSymbol ?? "").toUpperCase();
  const code = res.technicalCode ?? "";
  if (
    sym === "EBICS_OK" ||
    sym === "OK" ||
    code === "000000" ||
    sym.includes("NO_DOWNLOAD") ||
    code === "090005"
  ) {
    return;
  }
  throw new Error(
    res.technicalCodeShortText ||
      res.technicalCodeSymbol ||
      `EBICS technischer Fehler (${code || "?"})`,
  );
}

function menschenlesbarerFehler(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/null \(reading 'a'\)|keys\(\)|No keys provided/i.test(msg)) {
    return "EBICS-Schlüssel konnten nicht gelesen werden. Bitte erneut Initialisieren.";
  }
  if (/timed out|timeout|ETIMEDOUT|AbortError/i.test(msg)) {
    return "Zeitüberschreitung bei der Bankverbindung. Bitte erneut versuchen.";
  }
  if (/ENOTFOUND|ECONNREFUSED|fetch failed|network/i.test(msg)) {
    return "Keine Verbindung zur EBICS-Bank. Bitte später erneut versuchen.";
  }
  return msg;
}

/** INI-Brief aus bestehenden Schlüsseln (ohne erneutes INI/HIA an die Bank). */
export async function ebicsIniBriefErzeugen(
  admin: SupabaseClient,
  kunde: EbicsKundeRow,
): Promise<{ iniLetterHtml: string }> {
  const { BankLetter } = await loadEbicsPkg();
  const client = await createEbicsClient(admin, kunde);
  const keys = await client.keys();
  if (!keys) {
    throw new Error(
      "Keine lokalen EBICS-Schlüssel — bitte erneut Initialisieren.",
    );
  }
  const letter = new BankLetter({
    client,
    bankName: kunde.bank_name,
    template: EBICS_INI_BRIEF_DE,
  });
  return { iniLetterHtml: await letter.generate() };
}

export async function ebicsInitialisiereKunde(
  admin: SupabaseClient,
  kunde: EbicsKundeRow,
): Promise<{ iniLetterHtml: string }> {
  const { Orders } = await loadEbicsPkg();

  // Alte Blobs (z. B. mit IV verschlüsselt) verwerfen → sauberer Neustart
  await ebicsSchluesselZuruecksetzen(admin, kunde.id);

  const client = await createEbicsClient(admin, kunde);

  try {
    const existing = await client.keys();
    if (!existing) {
      // Erzeugt Schlüssel über INI-Pfad (Client.initialization)
    }

    const iniRes = await client.send(Orders.INI);
    assertTechnicalOk(iniRes);

    const keysAfterIni = await client.keys();
    if (!keysAfterIni) {
      throw new Error("EBICS-Schlüssel nach INI nicht lesbar.");
    }

    const hiaRes = await client.send(Orders.HIA);
    assertTechnicalOk(hiaRes);

    const { iniLetterHtml } = await ebicsIniBriefErzeugen(admin, kunde);

    await admin
      .from("ebics_kunden")
      .update({
        status: "wartet_auf_bank",
        letzter_fehler: null,
        initialisiert_am: new Date().toISOString(),
      })
      .eq("id", kunde.id);

    return { iniLetterHtml };
  } catch (err) {
    const msg = menschenlesbarerFehler(err);
    await admin
      .from("ebics_kunden")
      .update({ status: "fehler", letzter_fehler: msg })
      .eq("id", kunde.id);
    throw new Error(msg);
  }
}

export async function ebicsBankSchluesselHolen(
  admin: SupabaseClient,
  kunde: EbicsKundeRow,
): Promise<void> {
  if (kunde.status === "nicht_initialisiert") {
    throw new Error("Zuerst Initialisieren — noch keine Schlüssel bei der Bank.");
  }
  if (kunde.status === "bereit") return;

  const { Orders } = await loadEbicsPkg();
  const client = await createEbicsClient(admin, kunde);

  const keys = await client.keys();
  if (!keys) {
    throw new Error(
      "Keine lokalen EBICS-Schlüssel — bitte erneut Initialisieren.",
    );
  }

  try {
    const res = await client.send(Orders.HPB);
    assertTechnicalOk(res);
    if (res.bankKeys) {
      await client.setBankKeys(res.bankKeys);
    }
    await admin
      .from("ebics_kunden")
      .update({
        status: "bereit",
        letzter_fehler: null,
        bereit_am: new Date().toISOString(),
      })
      .eq("id", kunde.id);
  } catch (err) {
    const msg = menschenlesbarerFehler(err);
    // Typisch: Bank hat INI-Brief noch nicht freigeschaltet
    const hinweis = /EBICS_|technical|business|HPB|091/i.test(msg)
      ? `${msg} — Bank hat den Teilnehmer ggf. noch nicht freigeschaltet.`
      : msg;
    await admin
      .from("ebics_kunden")
      .update({ status: "fehler", letzter_fehler: hinweis })
      .eq("id", kunde.id);
    throw new Error(hinweis);
  }
}

export async function ebicsC53Abrufen(
  admin: SupabaseClient,
  kunde: EbicsKundeRow,
  von: string,
  bis: string,
): Promise<Buffer> {
  if (kunde.status !== "bereit") {
    throw new Error(
      `EBICS für ${kunde.gesellschaft_id} nicht bereit (Status: ${kunde.status}).`,
    );
  }
  const { Orders } = await loadEbicsPkg();
  const client = await createEbicsClient(admin, kunde);
  const res = await client.send(Orders.C53(von, bis));
  assertTechnicalOk(res);

  const data = res.orderData;
  if (
    !data ||
    (typeof data === "object" &&
      !Buffer.isBuffer(data) &&
      Object.keys(data).length === 0)
  ) {
    return Buffer.alloc(0);
  }
  if (Buffer.isBuffer(data)) return data;
  if (typeof data === "string") return Buffer.from(data, "binary");
  return Buffer.from(String(data), "binary");
}
