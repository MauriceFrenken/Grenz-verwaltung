/**
 * Einmalig: INI-Briefe aus DB-Schlüsseln als HTML + ZIP schreiben.
 * Usage: node --env-file=.env.local scripts/ebics-ini-briefe.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import JSZip from "jszip";

const require = createRequire(import.meta.url);
const { Client, BankLetter } = require("ebics-client");

const TEMPLATE = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">
<head>
	<meta http-equiv="content-type" content="text/html; charset=utf-8">
	<meta charset="UTF-8" />
	<title>EBICS ini</title>
</head>
<body>
	<div>
		<h2>EBICS-Initialisierungsbrief (INI)</h2>
		<table>
			<tr><td>Datum</td><td>{{ today }}</td></tr>
			<tr><td>Uhrzeit</td><td>{{ now }}</td></tr>
			<tr><td>Empfänger</td><td>{{ bankName }}</td></tr>
			<tr><td>User-ID</td><td>{{ userId }}</td></tr>
			<tr><td>Kunden-ID</td><td>{{ partnerId }}</td></tr>
		</table>
		<p>Öffentlicher Schlüssel für die elektronische Unterschrift (A006)</p>
		<p>Exponent ({{ keyExponentBits A006 }} Bit):</p>
		<p><code>{{ keyExponent A006 }}</code></p>
		<p>Modulus ({{ keyModulusBits A006 }} Bit):</p>
		<p><code>{{ keyModulus A006 }}</code></p>
		<p>Hash (SHA-256):</p>
		<p><code>{{ sha256 A006 }}</code></p>
		<p>Ich bestätige hiermit den obigen öffentlichen Schlüssel für meine elektronische Unterschrift.</p>
		<br/><br/><br/><br/>
		<table>
			<tr>
				<td>_________________________</td>
				<td>_________________________</td>
				<td>_________________________</td>
			</tr>
			<tr><td>Ort/Datum</td><td>Name/Firma</td><td>Unterschrift</td></tr>
		</table>
	</div>
	<div style="page-break-after:always"></div>
	<h2>EBICS-Initialisierungsbrief (HIA) - Seite 1/2</h2>
	<table>
		<tr><td>Datum</td><td>{{ today }}</td></tr>
		<tr><td>Uhrzeit</td><td>{{ now }}</td></tr>
		<tr><td>Empfänger</td><td>{{ bankName }}</td></tr>
		<tr><td>User-ID</td><td>{{ userId }}</td></tr>
		<tr><td>Kunden-ID</td><td>{{ partnerId }}</td></tr>
	</table>
	<div>
		<p>Öffentlicher Authentifikationsschlüssel (X002)</p>
		<p>Exponent ({{ keyExponentBits X002 }} Bit):</p>
		<p><code>{{ keyExponent X002 }}</code></p>
		<p>Modulus ({{ keyModulusBits X002 }} Bit):</p>
		<p><code>{{ keyModulus X002 }}</code></p>
		<p>Hash (SHA-256):</p>
		<p><code>{{ sha256 X002 }}</code></p>
		<p> Fortsetzung auf Seite 2 ...</p>
		<div style="page-break-after:always"></div>
		<h2>EBICS-Initialisierungsbrief (HIA) - Seite 2/2</h2>
		<table>
			<tr><td>Datum</td><td>{{ today }}</td></tr>
			<tr><td>Uhrzeit</td><td>{{ now }}</td></tr>
			<tr><td>Empfänger</td><td>{{ bankName }}</td></tr>
			<tr><td>User-ID</td><td>{{ userId }}</td></tr>
			<tr><td>Kunden-ID</td><td>{{ partnerId }}</td></tr>
		</table>
	</div>
	<div>
		<p>Öffentlicher Verschlüsselungsschlüssel (E002)</p>
		<p>Exponent ({{ keyExponentBits E002 }} Bit):</p>
		<p><code>{{ keyExponent E002 }}</code></p>
		<p>Modulus ({{ keyModulusBits E002 }} Bit):</p>
		<p><code>{{ keyModulus E002 }}</code></p>
		<p>Hash (SHA-256):</p>
		<p><code>{{ sha256 E002 }}</code></p>
		<p>Ich bestätige hiermit die obigen öffentlichen Schlüssel für meinen EBICS-Zugang.</p>
		<br/><br/><br/><br/>
		<table>
			<tr>
				<td>_________________________</td>
				<td>_________________________</td>
				<td>_________________________</td>
			</tr>
			<tr><td>Ort/Datum</td><td>Name/Firma</td><td>Unterschrift</td></tr>
		</table>
	</div>
</body>
</html>
`;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "tmp", "ebics-ini-briefe");

/** .env.local laden — Werte dürfen `#` enthalten (kein Kommentar-Strip). */
async function loadEnvLocal() {
  const { readFile } = await import("node:fs/promises");
  const text = await readFile(join(root, ".env.local"), "utf8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i <= 0) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    process.env[k] = v;
  }
}

await loadEnvLocal();

const url = process.env.VITE_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const master = process.env.EBICS_MASTER_KEY?.trim();
if (!url || !key || !master || master.length < 16) {
  console.error("Env fehlt: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EBICS_MASTER_KEY");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: kunden, error } = await admin
  .from("ebics_kunden")
  .select(
    "id, gesellschaft_id, partner_id, user_id, host_id, url, bank_name, status",
  )
  .order("gesellschaft_id");
if (error) throw error;

await mkdir(outDir, { recursive: true });
const zip = new JSZip();

for (const kunde of kunden ?? []) {
  const storage = {
    async write() {
      throw new Error("read-only");
    },
    async read() {
      const { data, error: e } = await admin
        .from("ebics_schluessel")
        .select("encrypted_keys")
        .eq("ebics_kunde_id", kunde.id)
        .maybeSingle();
      if (e) throw e;
      if (!data?.encrypted_keys) throw new Error(`Keine Schlüssel für ${kunde.gesellschaft_id}`);
      return data.encrypted_keys;
    },
  };

  const client = new Client({
    url: kunde.url,
    partnerId: kunde.partner_id,
    userId: kunde.user_id,
    hostId: kunde.host_id,
    passphrase: master,
    keyStorage: storage,
    bankName: kunde.bank_name,
    bankShortName: kunde.partner_id,
    languageCode: "de",
  });

  const keys = await client.keys();
  if (!keys) throw new Error(`keys() leer für ${kunde.gesellschaft_id}`);

  const letter = new BankLetter({
    client,
    bankName: kunde.bank_name,
    template: TEMPLATE,
  });
  const html = await letter.generate();
  const name = `EBICS-INI-${kunde.gesellschaft_id}.html`;
  await writeFile(join(outDir, name), html, "utf8");
  zip.file(name, html);
  console.log("OK", kunde.gesellschaft_id, kunde.status);
}

const zipBuf = await zip.generateAsync({ type: "nodebuffer" });
await writeFile(join(outDir, "EBICS-INI-Briefe.zip"), zipBuf);
console.log("Geschrieben nach", outDir);
