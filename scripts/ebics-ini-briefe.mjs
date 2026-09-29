/**
 * Einmalig: INI-Briefe aus DB-Schlüsseln als HTML + ZIP schreiben.
 * Usage: node scripts/ebics-ini-briefe.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import JSZip from "jszip";

const require = createRequire(import.meta.url);
const { Client } = require("ebics-client");

const TEILNEHMER = "Maurice Willi Frenken";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "tmp", "ebics-ini-briefe");

async function loadEnvLocal() {
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

function asHex(value) {
  return typeof value === "string" ? value : value.toString("hex");
}

function formatHexZeilen(hex, bytesProZeile = 16) {
  const bytes = hex.toUpperCase().replace(/\s+/g, "").match(/.{1,2}/g) ?? [];
  const zeilen = [];
  for (let i = 0; i < bytes.length; i += bytesProZeile) {
    zeilen.push(bytes.slice(i, i + bytesProZeile).join(" "));
  }
  return zeilen.join("\n");
}

function exponentBits(k) {
  const e = k.e();
  const bytes = Buffer.isBuffer(e)
    ? e.length
    : Buffer.from(String(e).replace(/\s+/g, ""), "hex").length;
  return bytes * 8;
}

function sha256Hex(k) {
  const str = [
    asHex(k.e("hex")).replace(/^(0+)/g, ""),
    asHex(k.n("hex")).replace(/^(0+)/g, ""),
  ]
    .map((x) => x.toLowerCase())
    .join(" ");
  const digestB64 = createHash("sha256").update(str).digest("base64").trim();
  return formatHexZeilen(Buffer.from(digestB64, "base64").toString("hex"), 16);
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function datumDe(d) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

function uhrzeitDe(d) {
  return new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(d);
}

function metaTabelle(p) {
  const rows = [
    ["Datum", p.datum],
    ["Uhrzeit", p.uhrzeit],
    ["Empfänger", p.bankName],
    ["Host-ID", p.hostId],
    ["User-ID", p.userId],
    ["Kunden-ID", p.partnerId],
    ["Firma", p.firmaName],
    ["Teilnehmer", p.teilnehmerName],
  ];
  return `<table class="meta">
${rows.map(([l, v]) => `  <tr><th>${esc(l)}</th><td>${esc(v)}</td></tr>`).join("\n")}
</table>`;
}

function schluesselBlock(titel, version, k) {
  return `<section class="key-block">
  <h3>${esc(titel)} (${esc(version)})</h3>
  <p class="label">Exponent (${exponentBits(k)} Bit)</p>
  <pre class="hex">${esc(formatHexZeilen(asHex(k.e("hex"))))}</pre>
  <p class="label">Modulus (${k.size()} Bit)</p>
  <pre class="hex">${esc(formatHexZeilen(asHex(k.n("hex"))))}</pre>
  <p class="label">Hash (SHA-256)</p>
  <pre class="hex hash">${esc(sha256Hex(k))}</pre>
</section>`;
}

function unterschrift(ortDatum, firmaName, teilnehmerName) {
  return `<table class="sign">
  <tr>
    <td class="line">${esc(ortDatum)}</td>
    <td class="line">${esc(firmaName)}<br/><span class="muted">${esc(teilnehmerName)}</span></td>
    <td class="line">&nbsp;</td>
  </tr>
  <tr>
    <td>Ort/Datum</td>
    <td>Name/Firma</td>
    <td>Unterschrift</td>
  </tr>
</table>`;
}

const CSS = `
@page {
  size: A4 portrait;
  margin: 15mm 14mm 16mm 14mm;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #e8e8e8; }
body {
  font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
  font-size: 10.5pt;
  line-height: 1.3;
  color: #111;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.sheet {
  width: 210mm;
  min-height: 297mm;
  margin: 8mm auto;
  padding: 15mm 14mm 16mm 14mm;
  background: #fff;
  box-shadow: 0 1px 6px rgba(0,0,0,.18);
}
@media print {
  html, body { background: #fff; }
  .sheet {
    width: auto; min-height: 0; margin: 0; padding: 0; box-shadow: none;
    break-after: page; page-break-after: always;
  }
  .sheet:last-child { break-after: auto; page-break-after: auto; }
  .print-hint { display: none; }
}
h1 { font-size: 14pt; margin: 0 0 10pt; font-weight: 700; }
h3 { font-size: 11pt; margin: 10pt 0 4pt; font-weight: 700; }
table.meta { width: 100%; border-collapse: collapse; margin: 0 0 10pt; }
table.meta th, table.meta td {
  border: 1px solid #333; padding: 4pt 7pt; text-align: left; vertical-align: top;
}
table.meta th { width: 28%; background: #f2f2f2; font-weight: 600; }
.label { margin: 6pt 0 2pt; font-weight: 600; }
pre.hex {
  font-family: "SF Mono", Menlo, Consolas, "Courier New", monospace;
  font-size: 7.8pt; line-height: 1.38; white-space: pre-wrap; word-break: break-all;
  border: 1px solid #333; background: #fafafa; padding: 6pt 7pt; margin: 0 0 4pt;
}
pre.hex.hash { font-size: 9pt; font-weight: 600; background: #f5f5f5; }
.confirm { margin: 10pt 0 14pt; }
table.sign { width: 100%; border-collapse: collapse; margin-top: 6pt; }
table.sign td { width: 33.33%; vertical-align: bottom; padding: 0 8pt 0 0; font-size: 9pt; }
table.sign td.line { border-bottom: 1px solid #111; height: 36pt; font-size: 9.5pt; padding-bottom: 3pt; }
.muted { color: #444; font-size: 8.5pt; }
.continued { margin-top: 12pt; font-style: italic; color: #444; }
.print-hint {
  width: 210mm; margin: 6mm auto 0; font-size: 9pt; color: #555; text-align: center;
}
`.trim();

function renderBrief({ bankName, hostId, userId, partnerId, firmaName, A006, X002, E002 }) {
  const jetzt = new Date();
  const datum = datumDe(jetzt);
  const uhrzeit = uhrzeitDe(jetzt);
  const meta = {
    datum,
    uhrzeit,
    bankName,
    hostId,
    userId,
    partnerId,
    firmaName,
    teilnehmerName: TEILNEHMER,
  };
  const ortDatum = `Düsseldorf, ${datum}`;
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <title>EBICS-INI ${esc(firmaName)} (${esc(partnerId)})</title>
  <style>${CSS}</style>
</head>
<body>
  <p class="print-hint">DIN A4 — zum Drucken: Cmd/Ctrl+P · Ziel „Als PDF speichern“ oder Drucker · Seitenformat A4</p>
  <div class="sheet">
    <h1>EBICS-Initialisierungsbrief (INI)</h1>
    ${metaTabelle(meta)}
    ${schluesselBlock("Öffentlicher Schlüssel für die elektronische Unterschrift", "A006", A006)}
    <p class="confirm">Ich bestätige hiermit den obigen öffentlichen Schlüssel für meine elektronische Unterschrift.</p>
    ${unterschrift(ortDatum, firmaName, TEILNEHMER)}
  </div>
  <div class="sheet">
    <h1>EBICS-Initialisierungsbrief (HIA) — Seite 1/2</h1>
    ${metaTabelle(meta)}
    ${schluesselBlock("Öffentlicher Authentifikationsschlüssel", "X002", X002)}
    <p class="continued">Fortsetzung auf Seite 2 …</p>
  </div>
  <div class="sheet">
    <h1>EBICS-Initialisierungsbrief (HIA) — Seite 2/2</h1>
    ${metaTabelle(meta)}
    ${schluesselBlock("Öffentlicher Verschlüsselungsschlüssel", "E002", E002)}
    <p class="confirm">Ich bestätige hiermit die obigen öffentlichen Schlüssel für meinen EBICS-Zugang.</p>
    ${unterschrift(ortDatum, firmaName, TEILNEHMER)}
  </div>
</body>
</html>
`;
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

const { data: ges } = await admin.from("gesellschaften").select("id, name");
const nameById = Object.fromEntries((ges ?? []).map((g) => [g.id, g.name]));

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
      if (!data?.encrypted_keys) {
        throw new Error(`Keine Schlüssel für ${kunde.gesellschaft_id}`);
      }
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

  const firmaName = nameById[kunde.gesellschaft_id] ?? kunde.gesellschaft_id;
  const html = renderBrief({
    bankName: kunde.bank_name,
    hostId: kunde.host_id,
    userId: kunde.user_id,
    partnerId: kunde.partner_id,
    firmaName,
    A006: keys.a(),
    X002: keys.x(),
    E002: keys.e(),
  });
  const name = `EBICS-INI-${kunde.gesellschaft_id}.html`;
  await writeFile(join(outDir, name), html, "utf8");
  zip.file(name, html);
  console.log("OK", kunde.gesellschaft_id, firmaName);
}

const zipBuf = await zip.generateAsync({ type: "nodebuffer" });
await writeFile(join(outDir, "EBICS-INI-Briefe.zip"), zipBuf);
console.log("Geschrieben nach", outDir);
