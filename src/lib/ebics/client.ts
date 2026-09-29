/**
 * EBICS-Protokoll (INI/HIA/HPB/C53) — nur bei Bedarf laden,
 * damit SSR der restlichen App nicht von ebics-client abhängt.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BankLetter as BankLetterType,
  Client as ClientType,
  Orders as OrdersType,
} from "ebics-client";

import { ebicsCipherMaterial } from "./config";
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

let ebicsPkg: EbicsPkg | null = null;

function loadEbicsPkg(): EbicsPkg {
  if (ebicsPkg) return ebicsPkg;
  const require = createRequire(import.meta.url);
  const mod = require("ebics-client") as EbicsPkg & { default?: EbicsPkg };
  ebicsPkg = (mod.default ?? mod) as EbicsPkg;
  return ebicsPkg;
}

function loadIniTemplateDe(): string {
  const require = createRequire(import.meta.url);
  const pkgPath = require.resolve("ebics-client/package.json");
  const templatePath = join(dirname(pkgPath), "templates", "ini_de.hbs");
  return readFileSync(templatePath, "utf8");
}

export function createEbicsClient(
  admin: SupabaseClient,
  kunde: EbicsKundeRow,
): ClientType {
  const { Client } = loadEbicsPkg();
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

export async function ebicsInitialisiereKunde(
  admin: SupabaseClient,
  kunde: EbicsKundeRow,
): Promise<{ iniLetterHtml: string }> {
  const { Orders, BankLetter } = loadEbicsPkg();
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
    });
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
  const { Orders } = loadEbicsPkg();
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
  const { Orders } = loadEbicsPkg();
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
