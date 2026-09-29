/**
 * EBICS INI/HIA-Brief (Deutsch) — druckfertig für Multivia / Volksbank.
 */

import { createHash } from "node:crypto";

export const EBICS_TEILNEHMER_NAME = "Maurice Willi Frenken";

export type EbicsIniBriefKey = {
  e: (encoding?: string) => string | Buffer;
  n: (encoding?: string) => string | Buffer;
  size: () => number;
};

export type EbicsIniBriefEingabe = {
  bankName: string;
  hostId: string;
  userId: string;
  partnerId: string;
  firmaName: string;
  teilnehmerName?: string;
  A006: EbicsIniBriefKey;
  X002: EbicsIniBriefKey;
  E002: EbicsIniBriefKey;
  jetzt?: Date;
};

function asHex(value: string | Buffer): string {
  if (typeof value === "string") return value;
  return value.toString("hex");
}

/** Hex-Bytes, 16 pro Zeile, Leerzeichen getrennt. */
function formatHexZeilen(hex: string, bytesProZeile = 16): string {
  const bytes = hex.toUpperCase().replace(/\s+/g, "").match(/.{1,2}/g) ?? [];
  const zeilen: string[] = [];
  for (let i = 0; i < bytes.length; i += bytesProZeile) {
    zeilen.push(bytes.slice(i, i + bytesProZeile).join(" "));
  }
  return zeilen.join("\n");
}

function exponentBits(k: EbicsIniBriefKey): number {
  const e = k.e();
  const bytes = Buffer.isBuffer(e)
    ? e.length
    : Buffer.from(String(e).replace(/\s+/g, ""), "hex").length;
  return bytes * 8;
}

function modulusHex(k: EbicsIniBriefKey): string {
  return formatHexZeilen(asHex(k.n("hex")));
}

function exponentHex(k: EbicsIniBriefKey): string {
  return formatHexZeilen(asHex(k.e("hex")), 16);
}

/** EBICS-Public-Key-Hash (wie ebics-client Crypto.digestPublicKey → Hex). */
function sha256Hex(k: EbicsIniBriefKey): string {
  const str = [
    asHex(k.e("hex")).replace(/^(0+)/g, ""),
    asHex(k.n("hex")).replace(/^(0+)/g, ""),
  ]
    .map((x) => x.toLowerCase())
    .join(" ");
  const digestB64 = createHash("sha256").update(str).digest("base64").trim();
  const hex = Buffer.from(digestB64, "base64").toString("hex");
  return formatHexZeilen(hex, 16);
}

function datumDe(d: Date): string {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

function uhrzeitDe(d: Date): string {
  return new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(d);
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function metaTabelle(p: {
  datum: string;
  uhrzeit: string;
  bankName: string;
  hostId: string;
  userId: string;
  partnerId: string;
  firmaName: string;
  teilnehmerName: string;
}): string {
  const rows: Array<[string, string]> = [
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
${rows
  .map(
    ([l, v]) => `  <tr><th>${esc(l)}</th><td>${esc(v)}</td></tr>`,
  )
  .join("\n")}
</table>`;
}

function schluesselBlock(
  titel: string,
  version: string,
  k: EbicsIniBriefKey,
): string {
  return `<section class="key-block">
  <h3>${esc(titel)} (${esc(version)})</h3>
  <p class="label">Exponent (${exponentBits(k)} Bit)</p>
  <pre class="hex">${esc(exponentHex(k))}</pre>
  <p class="label">Modulus (${k.size()} Bit)</p>
  <pre class="hex">${esc(modulusHex(k))}</pre>
  <p class="label">Hash (SHA-256)</p>
  <pre class="hex hash">${esc(sha256Hex(k))}</pre>
</section>`;
}

function unterschrift(
  ortDatum: string,
  firmaName: string,
  teilnehmerName: string,
): string {
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
@page { margin: 18mm 16mm; }
body {
  font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
  font-size: 11pt;
  line-height: 1.35;
  color: #111;
  margin: 0;
  padding: 0;
}
h1 {
  font-size: 16pt;
  margin: 0 0 12pt;
  font-weight: 700;
}
h3 {
  font-size: 12pt;
  margin: 14pt 0 6pt;
  font-weight: 700;
}
.page { page-break-after: always; }
.page:last-child { page-break-after: auto; }
table.meta {
  width: 100%;
  border-collapse: collapse;
  margin: 0 0 14pt;
}
table.meta th,
table.meta td {
  border: 1px solid #333;
  padding: 5pt 8pt;
  text-align: left;
  vertical-align: top;
}
table.meta th {
  width: 28%;
  background: #f2f2f2;
  font-weight: 600;
}
.label {
  margin: 8pt 0 3pt;
  font-weight: 600;
}
pre.hex {
  font-family: "SF Mono", Menlo, Consolas, "Courier New", monospace;
  font-size: 8.5pt;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-all;
  border: 1px solid #333;
  background: #fafafa;
  padding: 8pt;
  margin: 0 0 6pt;
}
pre.hex.hash {
  font-size: 9.5pt;
  font-weight: 600;
  background: #f5f5f5;
}
.confirm {
  margin: 14pt 0 18pt;
}
table.sign {
  width: 100%;
  border-collapse: collapse;
  margin-top: 8pt;
}
table.sign td {
  width: 33.33%;
  vertical-align: bottom;
  padding: 0 8pt 0 0;
  font-size: 9.5pt;
}
table.sign td.line {
  border-bottom: 1px solid #111;
  height: 42pt;
  font-size: 10pt;
  padding-bottom: 4pt;
}
.muted { color: #444; font-size: 9pt; }
.continued { margin-top: 16pt; font-style: italic; color: #444; }
`.trim();

export function renderEbicsIniBrief(eingabe: EbicsIniBriefEingabe): string {
  const jetzt = eingabe.jetzt ?? new Date();
  const datum = datumDe(jetzt);
  const uhrzeit = uhrzeitDe(jetzt);
  const teilnehmerName =
    eingabe.teilnehmerName?.trim() || EBICS_TEILNEHMER_NAME;
  const meta = {
    datum,
    uhrzeit,
    bankName: eingabe.bankName,
    hostId: eingabe.hostId,
    userId: eingabe.userId,
    partnerId: eingabe.partnerId,
    firmaName: eingabe.firmaName,
    teilnehmerName,
  };
  const ortDatum = `Düsseldorf, ${datum}`;

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <title>EBICS-INI ${esc(eingabe.firmaName)} (${esc(eingabe.partnerId)})</title>
  <style>${CSS}</style>
</head>
<body>
  <div class="page">
    <h1>EBICS-Initialisierungsbrief (INI)</h1>
    ${metaTabelle(meta)}
    ${schluesselBlock("Öffentlicher Schlüssel für die elektronische Unterschrift", "A006", eingabe.A006)}
    <p class="confirm">Ich bestätige hiermit den obigen öffentlichen Schlüssel für meine elektronische Unterschrift.</p>
    ${unterschrift(ortDatum, eingabe.firmaName, teilnehmerName)}
  </div>

  <div class="page">
    <h1>EBICS-Initialisierungsbrief (HIA) — Seite 1/2</h1>
    ${metaTabelle(meta)}
    ${schluesselBlock("Öffentlicher Authentifikationsschlüssel", "X002", eingabe.X002)}
    <p class="continued">Fortsetzung auf Seite 2 …</p>
  </div>

  <div class="page">
    <h1>EBICS-Initialisierungsbrief (HIA) — Seite 2/2</h1>
    ${metaTabelle(meta)}
    ${schluesselBlock("Öffentlicher Verschlüsselungsschlüssel", "E002", eingabe.E002)}
    <p class="confirm">Ich bestätige hiermit die obigen öffentlichen Schlüssel für meinen EBICS-Zugang.</p>
    ${unterschrift(ortDatum, eingabe.firmaName, teilnehmerName)}
  </div>
</body>
</html>
`;
}
