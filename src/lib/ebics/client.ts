/**
 * EBICS-Client-Factory und Abruf-Hilfen (nur Server / Service Role).
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BankLetter as BankLetterType, Client as ClientType } from "ebics-client";

import { ebicsCipherMaterial } from "./config";
import { createDbKeyStorage } from "./key-storage";

const require = createRequire(import.meta.url);
const ebics = require("ebics-client") as typeof import("ebics-client");
const { Client, Orders, BankLetter } = ebics;

export type EbicsKundeRow = {
  id: string;
  gesellschaft_id: string;
  partner_id: string;
  user_id: string;
  host_id: string;
  url: string;
  bank_name: string;
  status: "nicht_initialisiert" | "wartet_auf_bank" | "bereit" | "fehler";
  letzter_fehler: string | null;
};

export async function loadEbicsKunden(
  admin: SupabaseClient,
  gesellschaftId?: string | null,
): Promise<EbicsKundeRow[]> {
  let q = admin.from("ebics_kunden").select(
    "id, gesellschaft_id, partner_id, user_id, host_id, url, bank_name, status, letzter_fehler",
  );
  if (gesellschaftId) q = q.eq("gesellschaft_id", gesellschaftId);
  const { data, error } = await q.order("gesellschaft_id");
  if (error) throw new Error(error.message);
  return (data ?? []) as EbicsKundeRow[];
}

export function createEbicsClient(
  admin: SupabaseClient,
  kunde: EbicsKundeRow,
): ClientType {
  const { passphrase, iv } = ebicsCipherMaterial();
  return new Client({
    url: kunde.url,
    partnerId: kunde.partner_id,
    userId: kunde.user_id,
    hostId: kunde.host_id,
    passphrase,
    iv,
    keyStorage: createDbKeyStorage(admin, kunde.id),
    bankName: kunde.bank_name,
    bankShortName: kunde.partner_id,
    languageCode: "de",
  });
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
    // Keine neuen Auszüge im Zeitraum — kein Fehler
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

function loadIniTemplateDe(): string {
  const pkgPath = require.resolve("ebics-client/package.json");
  const templatePath = join(dirname(pkgPath), "templates", "ini_de.hbs");
  return readFileSync(templatePath, "utf8");
}

export async function ebicsInitialisiereKunde(
  admin: SupabaseClient,
  kunde: EbicsKundeRow,
): Promise<{ iniLetterHtml: string }> {
  const client = createEbicsClient(admin, kunde);

  try {
    const iniRes = await client.send(Orders.INI);
    assertTechnicalOk(iniRes);

    const hiaRes = await client.send(Orders.HIA);
    assertTechnicalOk(hiaRes);

    const letter = new BankLetter({
      client,
      bankName: kunde.bank_name,
      template: loadIniTemplateDe(),
    }) as BankLetterType;
    const iniLetterHtml = await letter.generate();

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
    const msg = err instanceof Error ? err.message : String(err);
    await admin
      .from("ebics_kunden")
      .update({ status: "fehler", letzter_fehler: msg })
      .eq("id", kunde.id);
    throw err;
  }
}

export async function ebicsBankSchluesselHolen(
  admin: SupabaseClient,
  kunde: EbicsKundeRow,
): Promise<void> {
  const client = createEbicsClient(admin, kunde);
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
    const msg = err instanceof Error ? err.message : String(err);
    await admin
      .from("ebics_kunden")
      .update({ status: "fehler", letzter_fehler: msg })
      .eq("id", kunde.id);
    throw err;
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
  const client = createEbicsClient(admin, kunde);
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

export { Orders };
